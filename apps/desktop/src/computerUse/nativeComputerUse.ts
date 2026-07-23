import type {
  ComputerUseAppState,
  ComputerUseDevice,
  ComputerUseOperation,
} from "@t3tools/contracts";
import { desktopCapturer, screen as electronScreen, systemPreferences } from "electron";
import { randomUUID } from "node:crypto";
import { hostname, arch, platform } from "node:os";
import { performance } from "node:perf_hooks";
import * as NodeTimersPromises from "node:timers/promises";

import {
  boundsMatch,
  selectUniqueWindowByTitle,
  screenshotPointToScreen,
  type ComputerUseBounds,
  type ComputerUseCoordinateSpace,
} from "./computerUseGeometry.ts";
import {
  describeAccessibilityTree,
  flattenAccessibilityTree,
  summarizeNavigation,
} from "./computerUseAccessibility.ts";

const platformName = (): ComputerUseDevice["platform"] =>
  platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux";

const sessionIsolation = (): ComputerUseDevice["sessionIsolation"] =>
  process.env.T3CODE_COMPUTER_USE_ISOLATED_SESSION === "1" ? "isolated" : "shared";

const availability = (): { available: boolean; unavailableReason?: string } => {
  if (platform() === "darwin") {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) {
      return {
        available: false,
        unavailableReason: "Grant Accessibility permission to T3 Code in System Settings.",
      };
    }
    if (systemPreferences.getMediaAccessStatus("screen") !== "granted") {
      return {
        available: false,
        unavailableReason: "Grant Screen Recording permission to T3 Code in System Settings.",
      };
    }
  }
  if (platform() === "linux" && !process.env.DISPLAY) {
    return {
      available: false,
      unavailableReason:
        "No X11/XWayland graphical session is attached (DISPLAY is empty). Native input is not available in a Wayland-only session.",
    };
  }
  return { available: true };
};

export const describeComputerUseDevice = (): ComputerUseDevice => ({
  deviceId: `${hostname()}:${platform()}:${arch()}`,
  label: hostname(),
  platform: platformName(),
  architecture: arch(),
  kind: sessionIsolation() === "isolated" ? "remote-desktop" : "prompting-device",
  sessionIsolation: sessionIsolation(),
  ...availability(),
  supportedOperations: [
    "listApps",
    "getAppState",
    "move",
    "click",
    "drag",
    "pressKey",
    "scroll",
    "typeText",
  ],
});

const loadNut = () => import("@nut-tree-fork/nut-js");
type NutModule = Awaited<ReturnType<typeof loadNut>>;
type NativeWindow = Awaited<ReturnType<NutModule["getActiveWindow"]>>;

interface WindowRecord {
  readonly windowId: string;
  readonly nativeKey: string;
  readonly window: NativeWindow;
  readonly title: string;
  readonly bounds: ComputerUseBounds;
}

interface Observation {
  readonly observationId: string;
  readonly windowId: string;
  readonly createdAt: number;
  readonly bounds: ComputerUseBounds;
  readonly coordinateSpace: ComputerUseCoordinateSpace;
  readonly elements: ComputerUseAppState["elements"];
}

const windowIds = new Map<string, string>();
const observations = new Map<string, Observation>();
const OBSERVATION_TTL_MS = 120_000;

const windowBounds = async (window: NativeWindow): Promise<ComputerUseBounds> => {
  const region = await window.region;
  return { x: region.left, y: region.top, width: region.width, height: region.height };
};

const nativeWindowKey = async (window: NativeWindow, title: string): Promise<string> => {
  const candidate = Reflect.get(window, "windowHandle");
  if (
    typeof candidate === "number" ||
    typeof candidate === "bigint" ||
    typeof candidate === "string"
  ) {
    return `handle:${String(candidate)}`;
  }
  const bounds = await windowBounds(window);
  return `fallback:${title}\u0000${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`;
};

const enumerateWindows = async (): Promise<WindowRecord[]> => {
  const { getWindows } = await loadNut();
  const windows = await getWindows();
  const records = await Promise.all(
    windows.slice(0, 200).map(async (window) => {
      const [title, bounds] = await Promise.all([window.title, windowBounds(window)]);
      if (!title.trim() || bounds.width <= 1 || bounds.height <= 1) return null;
      const nativeKey = await nativeWindowKey(window, title);
      let windowId = windowIds.get(nativeKey);
      if (!windowId) {
        windowId = `window-${randomUUID()}`;
        windowIds.set(nativeKey, windowId);
      }
      return { windowId, nativeKey, window, title, bounds } satisfies WindowRecord;
    }),
  );
  return records.filter((record): record is WindowRecord => record !== null);
};

const resolveWindow = async (input: { windowId?: string; app?: string }): Promise<WindowRecord> => {
  const windows = await enumerateWindows();
  if (input.windowId) {
    const match = windows.find((window) => window.windowId === input.windowId);
    if (match) return match;
    throw new Error(
      `Window ${JSON.stringify(input.windowId)} no longer exists. List windows again.`,
    );
  }
  if (input.app) {
    try {
      return selectUniqueWindowByTitle(windows, input.app);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`${message} Use one exact windowId from computer_list_apps.`);
    }
  }

  const { getActiveWindow } = await loadNut();
  const active = await getActiveWindow();
  const activeKey = await nativeWindowKey(active, await active.title);
  const match = windows.find((window) => window.nativeKey === activeKey);
  if (match) return match;
  throw new Error("The active window is not visible. List windows and select an exact windowId.");
};

const listApps = async () => {
  const windows = await enumerateWindows();
  const { getActiveWindow } = await loadNut();
  const active = await getActiveWindow().catch(() => null);
  const activeKey = active ? await nativeWindowKey(active, await active.title) : null;
  return {
    apps: windows.slice(0, 100).map((window, index) => ({
      windowId: window.windowId,
      index,
      title: window.title,
      focused: window.nativeKey === activeKey,
      ...window.bounds,
    })),
  };
};

const captureWindow = async (bounds: ComputerUseBounds) => {
  const display = electronScreen.getDisplayMatching(bounds);
  const displayBounds = display.bounds;
  const fullyContained =
    bounds.x >= displayBounds.x &&
    bounds.y >= displayBounds.y &&
    bounds.x + bounds.width <= displayBounds.x + displayBounds.width &&
    bounds.y + bounds.height <= displayBounds.y + displayBounds.height;
  if (!fullyContained) {
    throw new Error(
      "The target window spans multiple displays. Move it fully onto one display and observe again.",
    );
  }

  const requestedWidth = Math.max(1, Math.round(displayBounds.width * display.scaleFactor));
  const requestedHeight = Math.max(1, Math.round(displayBounds.height * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: requestedWidth, height: requestedHeight },
    fetchWindowIcons: false,
  });
  const source =
    sources.find((candidate) => candidate.display_id === String(display.id)) ??
    (sources.length === 1 ? sources[0] : undefined);
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("The target display could not be captured. Check Screen Recording permission.");
  }
  const displayImage = source.thumbnail;
  const displayImageSize = displayImage.getSize();
  const scaleX = displayImageSize.width / displayBounds.width;
  const scaleY = displayImageSize.height / displayBounds.height;
  const crop = {
    x: Math.max(0, Math.round((bounds.x - displayBounds.x) * scaleX)),
    y: Math.max(0, Math.round((bounds.y - displayBounds.y) * scaleY)),
    width: Math.max(1, Math.round(bounds.width * scaleX)),
    height: Math.max(1, Math.round(bounds.height * scaleY)),
  };
  crop.width = Math.min(crop.width, displayImageSize.width - crop.x);
  crop.height = Math.min(crop.height, displayImageSize.height - crop.y);
  const image = displayImage.crop(crop);
  const size = image.getSize();
  const coordinateSpace: ComputerUseCoordinateSpace = {
    ...bounds,
    screenshotWidth: size.width,
    screenshotHeight: size.height,
  };
  return {
    screenshot: {
      mimeType: "image/png" as const,
      data: image.toPNG().toString("base64"),
      width: size.width,
      height: size.height,
    },
    coordinateSpace,
  };
};

const captureSettledWindow = async (target: NativeWindow) => {
  let previousData: string | undefined;
  let latest: Awaited<ReturnType<typeof captureWindow>> | undefined;
  let latestBounds: ComputerUseBounds | undefined;
  // Two identical samples are a cheap and effective guard against capturing a
  // menu half-open or a window mid-animation. Dynamic UIs still proceed after
  // the bounded attempts, so clocks and carets cannot stall the agent.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    latestBounds = await windowBounds(target);
    latest = await captureWindow(latestBounds);
    if (latest.screenshot.data === previousData) return { ...latest, bounds: latestBounds };
    previousData = latest.screenshot.data;
    if (attempt < 5) await NodeTimersPromises.setTimeout(160);
  }
  if (!latest || !latestBounds) throw new Error("The target window could not be captured.");
  return { ...latest, bounds: latestBounds };
};

const discardExpiredObservations = () => {
  const cutoff = performance.now() - OBSERVATION_TTL_MS;
  for (const [id, observation] of observations) {
    if (observation.createdAt < cutoff) observations.delete(id);
  }
};

const getAppState = async (input: {
  windowId?: string;
  app?: string;
}): Promise<ComputerUseAppState> => {
  const target = await resolveWindow(input);
  await target.window.focus();
  await NodeTimersPromises.setTimeout(150);
  const { screenshot, coordinateSpace, bounds } = await captureSettledWindow(target.window);
  const elements = await target.window
    .getElements(1_000)
    .then((root) => flattenAccessibilityTree(root, coordinateSpace))
    .catch(() => []);
  const observationId = `observation-${randomUUID()}`;
  observations.set(observationId, {
    observationId,
    windowId: target.windowId,
    createdAt: performance.now(),
    bounds,
    coordinateSpace,
    elements,
  });
  discardExpiredObservations();
  const text = describeAccessibilityTree(elements);
  return {
    app: target.title,
    windowId: target.windowId,
    observationId,
    text,
    elements,
    navigation: summarizeNavigation(elements),
    coordinateSpace: {
      kind: "window-screenshot",
      screenX: bounds.x,
      screenY: bounds.y,
      logicalWidth: bounds.width,
      logicalHeight: bounds.height,
      screenshotWidth: screenshot.width,
      screenshotHeight: screenshot.height,
      scaleX: screenshot.width / bounds.width,
      scaleY: screenshot.height / bounds.height,
    },
    screenshot,
  };
};

const requireFreshObservation = async (input: Record<string, unknown>) => {
  const observationId = String(input.observationId ?? "");
  const windowId = String(input.windowId ?? "");
  const observation = observations.get(observationId);
  if (!observation || performance.now() - observation.createdAt > OBSERVATION_TTL_MS) {
    observations.delete(observationId);
    throw new Error(
      "This observation is missing, expired, or already used. Observe the window again.",
    );
  }
  if (observation.windowId !== windowId) {
    throw new Error("The observation does not belong to the requested window. Observe it again.");
  }
  const target = await resolveWindow({ windowId });
  const currentBounds = await windowBounds(target.window);
  if (!boundsMatch(observation.bounds, currentBounds)) {
    observations.delete(observationId);
    throw new Error("The target window moved or resized after observation. Observe it again.");
  }
  await target.window.focus();
  await NodeTimersPromises.setTimeout(100);
  observations.delete(observationId);
  return { target, observation };
};

const pointFromInput = (
  observation: Observation,
  input: Record<string, unknown>,
): { x: number; y: number } => {
  if (input.elementIndex !== undefined) {
    const element = observation.elements[Number(input.elementIndex)];
    if (
      !element ||
      element.x === undefined ||
      element.y === undefined ||
      element.width === undefined ||
      element.height === undefined
    ) {
      throw new Error(
        "The requested accessibility element has no clickable bounds. Observe again.",
      );
    }
    if (element.enabled === false) {
      throw new Error(
        "The requested accessibility element is disabled. Observe and choose an enabled control.",
      );
    }
    return screenshotPointToScreen(observation.coordinateSpace, {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    });
  }
  if (input.x === undefined || input.y === undefined) {
    throw new Error(
      "Provide either elementIndex or both x and y from the latest window screenshot.",
    );
  }
  return screenshotPointToScreen(observation.coordinateSpace, {
    x: Number(input.x),
    y: Number(input.y),
  });
};

const moveVisibleCursor = async (
  nut: NutModule,
  point: { readonly x: number; readonly y: number },
) => {
  // Moving the real OS pointer makes agent activity observable to the user and
  // avoids an instantaneous teleport that is difficult to follow or interrupt.
  nut.mouse.config.mouseSpeed = 1_800;
  nut.mouse.config.autoDelayMs = 35;
  await nut.mouse.move(nut.straightTo(new nut.Point(point.x, point.y)));
};

const keyFromName = async (name: string) => {
  const { Key } = await loadNut();
  const aliases: Record<string, keyof typeof Key> = {
    enter: "Enter",
    return: "Return",
    escape: "Escape",
    esc: "Escape",
    space: "Space",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
  };
  const candidate =
    aliases[name.toLocaleLowerCase()] ??
    (name.length === 1 ? (name.toUpperCase() as keyof typeof Key) : (name as keyof typeof Key));
  const key = Key[candidate];
  if (typeof key !== "number") throw new Error(`Unsupported key ${JSON.stringify(name)}.`);
  return key;
};

export async function executeComputerUse(operation: ComputerUseOperation, rawInput: unknown) {
  const device = describeComputerUseDevice();
  if (!device.available)
    throw new Error(device.unavailableReason ?? "Computer Use is unavailable.");
  const input = (rawInput ?? {}) as Record<string, unknown> & {
    windowId?: string;
    app?: string;
  };
  if (operation === "listApps") return await listApps();
  if (operation === "getAppState") return await getAppState(input);

  const { observation } = await requireFreshObservation(input);
  const nut = await loadNut();
  switch (operation) {
    case "move": {
      const point = pointFromInput(observation, input);
      await moveVisibleCursor(nut, point);
      await NodeTimersPromises.setTimeout(250);
      return null;
    }
    case "click": {
      const point = pointFromInput(observation, input);
      await moveVisibleCursor(nut, point);
      const button =
        input.mouseButton === "right"
          ? nut.Button.RIGHT
          : input.mouseButton === "middle"
            ? nut.Button.MIDDLE
            : nut.Button.LEFT;
      const count = Math.max(1, Math.min(3, Number(input.clickCount ?? 1)));
      if (count === 2) await nut.mouse.doubleClick(button);
      else for (let index = 0; index < count; index += 1) await nut.mouse.click(button);
      return null;
    }
    case "drag": {
      const from = screenshotPointToScreen(observation.coordinateSpace, {
        x: Number(input.fromX),
        y: Number(input.fromY),
      });
      const to = screenshotPointToScreen(observation.coordinateSpace, {
        x: Number(input.toX),
        y: Number(input.toY),
      });
      await moveVisibleCursor(nut, from);
      nut.mouse.config.mouseSpeed = 1_400;
      await nut.mouse.drag(nut.straightTo(new nut.Point(to.x, to.y)));
      return null;
    }
    case "pressKey": {
      const modifierNames = Array.isArray(input.modifiers) ? input.modifiers : [];
      const modifierKeys = await Promise.all(
        modifierNames.map((modifier) =>
          keyFromName(
            modifier === "Meta"
              ? platform() === "darwin"
                ? "LeftCmd"
                : "LeftMeta"
              : modifier === "Control"
                ? "LeftControl"
                : modifier === "Alt"
                  ? "LeftAlt"
                  : "LeftShift",
          ),
        ),
      );
      const keys = [...modifierKeys, await keyFromName(String(input.key))];
      await nut.keyboard.pressKey(...keys);
      await nut.keyboard.releaseKey(...keys.toReversed());
      return null;
    }
    case "scroll": {
      if (input.x !== undefined && input.y !== undefined) {
        const point = screenshotPointToScreen(observation.coordinateSpace, {
          x: Number(input.x),
          y: Number(input.y),
        });
        await moveVisibleCursor(nut, point);
      }
      const deltaY = Number(input.deltaY ?? 0);
      const deltaX = Number(input.deltaX ?? 0);
      if (deltaY > 0) await nut.mouse.scrollDown(Math.ceil(deltaY));
      if (deltaY < 0) await nut.mouse.scrollUp(Math.ceil(-deltaY));
      if (deltaX > 0) await nut.mouse.scrollRight(Math.ceil(deltaX));
      if (deltaX < 0) await nut.mouse.scrollLeft(Math.ceil(-deltaX));
      return null;
    }
    case "typeText":
      await nut.keyboard.type(String(input.text ?? ""));
      return null;
  }
}
