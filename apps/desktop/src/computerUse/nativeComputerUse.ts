import type {
  ComputerUseAppState,
  ComputerUseDevice,
  ComputerUseElement,
  ComputerUseOperation,
} from "@t3tools/contracts";
import { desktopCapturer, screen as electronScreen, systemPreferences } from "electron";
import { hostname, arch, platform } from "node:os";

const platformName = (): ComputerUseDevice["platform"] =>
  platform() === "darwin" ? "macos" : platform() === "win32" ? "windows" : "linux";

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
  kind: "prompting-device",
  ...availability(),
  supportedOperations: [
    "listApps",
    "getAppState",
    "click",
    "drag",
    "pressKey",
    "scroll",
    "typeText",
  ],
});

const loadNut = () => import("@nut-tree-fork/nut-js");

const findWindow = async (app?: string) => {
  const nut = await loadNut();
  if (!app) return await nut.getActiveWindow();
  const windows = await nut.getWindows();
  for (const window of windows) {
    const title = await window.title;
    if (title.toLocaleLowerCase().includes(app.toLocaleLowerCase())) return window;
  }
  throw new Error(`No visible application window matches ${JSON.stringify(app)}.`);
};

const listApps = async () => {
  const { getWindows } = await loadNut();
  const windows = await getWindows();
  const apps = await Promise.all(
    windows.slice(0, 100).map(async (window, index) => {
      const [title, region] = await Promise.all([window.title, window.region]);
      return {
        index,
        title,
        x: region.left,
        y: region.top,
        width: region.width,
        height: region.height,
      };
    }),
  );
  return { apps: apps.filter((app) => app.title.trim().length > 0) };
};

type WindowElement = Awaited<ReturnType<Awaited<ReturnType<typeof findWindow>>["getElements"]>>;

const flattenElements = (root: WindowElement): ComputerUseElement[] => {
  const result: ComputerUseElement[] = [];
  const visit = (element: WindowElement) => {
    const region = element.region;
    result.push({
      index: result.length,
      ...(element.role || element.type ? { role: element.role ?? element.type } : {}),
      ...(element.title ? { label: element.title } : {}),
      ...(element.value ? { value: element.value } : {}),
      ...(region
        ? { x: region.left, y: region.top, width: region.width, height: region.height }
        : {}),
    });
    for (const child of element.children ?? []) visit(child);
  };
  visit(root);
  return result.slice(0, 1_000);
};

const capturePrimaryScreen = async () => {
  const display = electronScreen.getPrimaryDisplay();
  const { width, height } = display.size;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width, height },
    fetchWindowIcons: false,
  });
  const source =
    sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
  if (!source) throw new Error("No desktop screen is available for capture.");
  const image = source.thumbnail;
  const size = image.getSize();
  return {
    mimeType: "image/png" as const,
    data: image.toPNG().toString("base64"),
    width: size.width,
    height: size.height,
  };
};

const getAppState = async (input: { app?: string }): Promise<ComputerUseAppState> => {
  const window = await findWindow(input.app);
  await window.focus();
  const app = await window.title;
  const elements = await window
    .getElements(1_000)
    .then(flattenElements)
    .catch(() => []);
  const text = elements
    .map(
      (element) =>
        `[${element.index}] ${element.role ?? "element"}${element.label ? ` ${JSON.stringify(element.label)}` : ""}${element.value ? ` value=${JSON.stringify(element.value)}` : ""}`,
    )
    .join("\n");
  return { app, text, elements, screenshot: await capturePrimaryScreen() };
};

const focusTarget = async (input: { app?: string }) => {
  if (input.app) await (await findWindow(input.app)).focus();
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
  const input = (rawInput ?? {}) as Record<string, unknown> & { app?: string };
  const nut = await loadNut();
  switch (operation) {
    case "listApps":
      return await listApps();
    case "getAppState":
      return await getAppState(input);
    case "click": {
      await focusTarget(input);
      await nut.mouse.setPosition(new nut.Point(Number(input.x), Number(input.y)));
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
    case "drag":
      await focusTarget(input);
      await nut.mouse.setPosition(new nut.Point(Number(input.fromX), Number(input.fromY)));
      await nut.mouse.drag(nut.straightTo(new nut.Point(Number(input.toX), Number(input.toY))));
      return null;
    case "pressKey": {
      await focusTarget(input);
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
      await focusTarget(input);
      if (input.x !== undefined && input.y !== undefined) {
        await nut.mouse.setPosition(new nut.Point(Number(input.x), Number(input.y)));
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
      await focusTarget(input);
      await nut.keyboard.type(String(input.text ?? ""));
      return null;
  }
}
