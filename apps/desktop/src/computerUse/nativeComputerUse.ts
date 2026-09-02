import type {
  ComputerUseAppState,
  ComputerUseDevice,
  ComputerUseOperation,
} from "@t3tools/contracts";
import {
  HostProcessArchitecture,
  HostProcessEnvironment,
  HostProcessHostname,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import { app, desktopCapturer, screen as electronScreen, systemPreferences } from "electron";
import Store from "electron-store";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";
import * as NodePerfHooks from "node:perf_hooks";
import * as NodeTimersPromises from "node:timers/promises";

import {
  boundsMatch,
  fitScreenshotSize,
  selectWindowCaptureSource,
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
import { createSerializedAbortableExecutor } from "./computerUseExecution.ts";

interface ComputerUseRuntime {
  readonly platform: NodeJS.Platform;
  readonly architecture: NodeJS.Architecture;
  readonly hostname: string;
  readonly environment: NodeJS.ProcessEnv;
}

const readRuntime = (): ComputerUseRuntime => ({
  platform: Effect.runSync(HostProcessPlatform),
  architecture: Effect.runSync(HostProcessArchitecture),
  hostname: Effect.runSync(HostProcessHostname),
  environment: Effect.runSync(HostProcessEnvironment),
});

const platformName = (runtime: ComputerUseRuntime): ComputerUseDevice["platform"] =>
  runtime.platform === "darwin" ? "macos" : runtime.platform === "win32" ? "windows" : "linux";

const sessionIsolation = (runtime: ComputerUseRuntime): ComputerUseDevice["sessionIsolation"] =>
  runtime.environment.T3CODE_COMPUTER_USE_ISOLATED_SESSION === "1" ? "isolated" : "shared";

interface ComputerUseStore {
  readonly deviceId?: string;
}

let deviceStore: Store<ComputerUseStore> | undefined;
const installationDeviceId = (): string => {
  deviceStore ??= new Store<ComputerUseStore>({
    name: "computer-use",
    cwd: app.getPath("userData"),
  });
  const existing = deviceStore.get("deviceId");
  if (existing) return existing;
  const created = `desktop-${NodeCrypto.randomUUID()}`;
  deviceStore.set("deviceId", created);
  return created;
};

const availability = (
  runtime: ComputerUseRuntime,
): { available: boolean; unavailableReason?: string } => {
  if (runtime.platform === "darwin") {
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
  if (runtime.platform === "linux" && !runtime.environment.DISPLAY) {
    return {
      available: false,
      unavailableReason:
        "No X11/XWayland graphical session is attached (DISPLAY is empty). Native input is not available in a Wayland-only session.",
    };
  }
  return { available: true };
};

export const describeComputerUseDevice = (runtime = readRuntime()): ComputerUseDevice => ({
  deviceId: installationDeviceId(),
  label: runtime.hostname,
  platform: platformName(runtime),
  architecture: runtime.architecture,
  kind: sessionIsolation(runtime) === "isolated" ? "remote-desktop" : "prompting-device",
  sessionIsolation: sessionIsolation(runtime),
  platformSupport: runtime.platform === "darwin" ? "verified" : "experimental",
  ...availability(runtime),
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

export const probeComputerUseDevice = async (): Promise<ComputerUseDevice> => {
  const device = describeComputerUseDevice();
  if (!device.available) return device;
  const timeout = new AbortController();
  try {
    const { getWindows } = await loadNut();
    await Promise.race([
      getWindows(),
      NodeTimersPromises.setTimeout(5_000, undefined, { signal: timeout.signal }).then(() => {
        throw new Error("Native window inspection did not respond within 5 seconds.");
      }),
    ]);
    return device;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ...device,
      available: false,
      unavailableReason: `Native window inspection is unavailable: ${detail}`,
    };
  } finally {
    timeout.abort();
  }
};

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
const OBSERVATION_TTL_MS = 30_000;

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
        windowId = `window-${NodeCrypto.randomUUID()}`;
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
      throw new Error(`${message} Use one exact windowId from computer_list_apps.`, { cause });
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

const captureDisplayCrop = async (bounds: ComputerUseBounds) => {
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
  const croppedImage = displayImage.crop(crop);
  const croppedSize = croppedImage.getSize();
  const fittedSize = fitScreenshotSize(croppedSize.width, croppedSize.height);
  const image =
    fittedSize.width === croppedSize.width && fittedSize.height === croppedSize.height
      ? croppedImage
      : croppedImage.resize({ ...fittedSize, quality: "good" });
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

const captureNativeWindow = async (target: WindowRecord) => {
  const display = electronScreen.getDisplayMatching(target.bounds);
  const requested = fitScreenshotSize(
    Math.max(1, Math.round(target.bounds.width * display.scaleFactor)),
    Math.max(1, Math.round(target.bounds.height * display.scaleFactor)),
  );
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: requested,
    fetchWindowIcons: false,
  });
  const source = selectWindowCaptureSource(sources, target);
  if (!source || source.thumbnail.isEmpty()) return undefined;
  const sourceSize = source.thumbnail.getSize();
  const boundsRatio = target.bounds.width / target.bounds.height;
  const sourceRatio = sourceSize.width / sourceSize.height;
  if (Math.abs(boundsRatio - sourceRatio) / boundsRatio > 0.04) return undefined;
  const fittedSize = fitScreenshotSize(sourceSize.width, sourceSize.height);
  const image =
    fittedSize.width === sourceSize.width && fittedSize.height === sourceSize.height
      ? source.thumbnail
      : source.thumbnail.resize({ ...fittedSize, quality: "good" });
  const size = image.getSize();
  return {
    screenshot: {
      mimeType: "image/png" as const,
      data: image.toPNG().toString("base64"),
      width: size.width,
      height: size.height,
    },
    coordinateSpace: {
      ...target.bounds,
      screenshotWidth: size.width,
      screenshotHeight: size.height,
    } satisfies ComputerUseCoordinateSpace,
  };
};

const captureTargetWindow = async (target: WindowRecord) =>
  (await captureNativeWindow(target)) ?? captureDisplayCrop(target.bounds);

const abortError = () => new Error("Computer Use action was cancelled.");

const requireNotAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw abortError();
};

const wait = async (durationMs: number, signal: AbortSignal) => {
  try {
    await NodeTimersPromises.setTimeout(durationMs, undefined, { signal });
  } catch (cause) {
    if (signal.aborted) throw abortError();
    throw cause;
  }
};

const captureSettledWindow = async (target: WindowRecord, signal: AbortSignal) => {
  requireNotAborted(signal);
  const firstBounds = await windowBounds(target.window);
  const first = await captureTargetWindow({ ...target, bounds: firstBounds });
  await wait(120, signal);
  const latestBounds = await windowBounds(target.window);
  const latest = await captureTargetWindow({ ...target, bounds: latestBounds });
  requireNotAborted(signal);
  // A second bounded sample avoids an obviously half-open menu without making
  // dynamic clocks, carets, or video force six full PNG captures per observation.
  return first.screenshot.data === latest.screenshot.data
    ? { ...first, bounds: firstBounds }
    : { ...latest, bounds: latestBounds };
};

const discardExpiredObservations = () => {
  const cutoff = NodePerfHooks.performance.now() - OBSERVATION_TTL_MS;
  for (const [id, observation] of observations) {
    if (observation.createdAt < cutoff) observations.delete(id);
  }
};

const getAppState = async (
  input: {
    windowId?: string;
    app?: string;
  },
  signal: AbortSignal,
): Promise<ComputerUseAppState> => {
  requireNotAborted(signal);
  const target = await resolveWindow(input);
  await target.window.focus();
  await wait(150, signal);
  const { screenshot, coordinateSpace, bounds } = await captureSettledWindow(target, signal);
  const elements = await target.window
    .getElements(1_000)
    .then((root) => flattenAccessibilityTree(root, coordinateSpace))
    .catch(() => []);
  requireNotAborted(signal);
  const observationId = `observation-${NodeCrypto.randomUUID()}`;
  observations.set(observationId, {
    observationId,
    windowId: target.windowId,
    createdAt: NodePerfHooks.performance.now(),
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

const requireFreshObservation = async (input: Record<string, unknown>, signal: AbortSignal) => {
  requireNotAborted(signal);
  const observationId = String(input.observationId ?? "");
  const windowId = String(input.windowId ?? "");
  const observation = observations.get(observationId);
  if (
    !observation ||
    NodePerfHooks.performance.now() - observation.createdAt > OBSERVATION_TTL_MS
  ) {
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
  await wait(100, signal);
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

async function executeComputerUseNow(
  operation: ComputerUseOperation,
  rawInput: unknown,
  signal: AbortSignal,
) {
  requireNotAborted(signal);
  const runtime = readRuntime();
  const device = describeComputerUseDevice(runtime);
  if (!device.available)
    throw new Error(device.unavailableReason ?? "Computer Use is unavailable.");
  const input = (rawInput ?? {}) as Record<string, unknown> & {
    windowId?: string;
    app?: string;
  };
  if (operation === "listApps") {
    const result = await listApps();
    requireNotAborted(signal);
    return result;
  }
  if (operation === "getAppState") return await getAppState(input, signal);

  const { observation } = await requireFreshObservation(input, signal);
  const nut = await loadNut();
  requireNotAborted(signal);
  switch (operation) {
    case "move": {
      const point = pointFromInput(observation, input);
      await moveVisibleCursor(nut, point);
      await wait(250, signal);
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
      else {
        for (let index = 0; index < count; index += 1) {
          requireNotAborted(signal);
          await nut.mouse.click(button);
        }
      }
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
      requireNotAborted(signal);
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
              ? runtime.platform === "darwin"
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
      requireNotAborted(signal);
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
      requireNotAborted(signal);
      const deltaY = Number(input.deltaY ?? 0);
      const deltaX = Number(input.deltaX ?? 0);
      if (deltaY > 0) await nut.mouse.scrollDown(Math.ceil(deltaY));
      if (deltaY < 0) await nut.mouse.scrollUp(Math.ceil(-deltaY));
      if (deltaX > 0) await nut.mouse.scrollRight(Math.ceil(deltaX));
      if (deltaX < 0) await nut.mouse.scrollLeft(Math.ceil(-deltaX));
      return null;
    }
    case "typeText":
      requireNotAborted(signal);
      await nut.keyboard.type(String(input.text ?? ""));
      return null;
  }
}

const executor = createSerializedAbortableExecutor(
  (input: { readonly operation: ComputerUseOperation; readonly rawInput: unknown }, signal) =>
    executeComputerUseNow(input.operation, input.rawInput, signal),
);

export function executeComputerUse(
  requestId: string,
  operation: ComputerUseOperation,
  rawInput: unknown,
) {
  return executor.execute(requestId, { operation, rawInput });
}

export function cancelComputerUse(requestId: string) {
  executor.cancel(requestId);
}

export function cancelAllComputerUse() {
  executor.cancelAll();
}
