// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type BrowserNavigationTarget,
  type ChatImageAttachment,
  type ThreadId,
  VisualEvidenceCaptureError,
  type VisualEvidenceCaptureInput,
  type VisualEvidenceCaptureResult,
} from "@t3tools/contracts";
import { normalizePreviewUrl } from "@t3tools/shared/preview";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { chromium, type Browser, type Page } from "playwright-core";

import { attachmentRelativePath, createAttachmentId } from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";

const DEFAULT_VIEWPORT = { width: 1_440, height: 900 } as const;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PENDING_EVIDENCE_PER_THREAD = 3;

export interface PendingEvidence {
  readonly attachment: ChatImageAttachment;
  readonly path: string;
}

const pendingEvidenceByThread = new Map<string, ReadonlyArray<PendingEvidence>>();

interface CapturedImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

function isExecutable(path: string): boolean {
  try {
    NodeFS.accessSync(path, NodeFS.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function newestPlaywrightChromium(cacheDir: string): string | undefined {
  let entries: Array<NodeFS.Dirent>;
  try {
    entries = NodeFS.readdirSync(cacheDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  return entries
    .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
    .sort((left, right) => Number(right.name.slice(9)) - Number(left.name.slice(9)))
    .flatMap((entry) => [
      NodePath.join(cacheDir, entry.name, "chrome-linux64", "chrome"),
      NodePath.join(cacheDir, entry.name, "chrome-linux", "chrome"),
    ])
    .find(isExecutable);
}

/** Resolve a server-local Chromium without depending on a desktop browser host. */
export function resolveVisualEvidenceBrowserExecutable(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const configured = environment.T3CODE_BROWSER_EXECUTABLE?.trim();
  if (configured && isExecutable(configured)) return configured;

  const bundled = (() => {
    try {
      return chromium.executablePath();
    } catch {
      return undefined;
    }
  })();
  if (bundled && isExecutable(bundled)) return bundled;

  const pathCandidates = (environment.PATH ?? "")
    .split(NodePath.delimiter)
    .filter((entry) => entry.length > 0)
    .flatMap((entry) =>
      ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((binary) =>
        NodePath.join(entry, binary),
      ),
    );
  const systemCandidate = [
    ...pathCandidates,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find(isExecutable);
  if (systemCandidate) return systemCandidate;

  const cacheRoots = [
    environment.PLAYWRIGHT_BROWSERS_PATH,
    environment.XDG_CACHE_HOME
      ? NodePath.join(environment.XDG_CACHE_HOME, "ms-playwright")
      : undefined,
    environment.HOME ? NodePath.join(environment.HOME, ".cache", "ms-playwright") : undefined,
  ].filter((path): path is string => path !== undefined && path.length > 0);
  return cacheRoots.map(newestPlaywrightChromium).find((path) => path !== undefined);
}

export function resolveVisualEvidenceTarget(target: BrowserNavigationTarget): string {
  if (target.kind === "url") return normalizePreviewUrl(target.url);
  const protocol = target.protocol ?? "http";
  const path = target.path?.startsWith("/") ? target.path : `/${target.path ?? ""}`;
  return `${protocol}://127.0.0.1:${target.port}${path}`;
}

function attachmentName(label: string, mode: VisualEvidenceCaptureInput["mode"]): string {
  const safeLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeLabel || "visual-evidence"}-${mode}.jpg`;
}

const capturePage = Effect.fn("VisualEvidence.capturePage")(function* (input: {
  readonly browser: Browser;
  readonly capture: VisualEvidenceCaptureInput;
  readonly url: string;
}) {
  const viewport = input.capture.viewport ?? DEFAULT_VIEWPORT;
  const timeout = input.capture.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const context = yield* Effect.tryPromise({
    try: () => input.browser.newContext({ viewport, deviceScaleFactor: 1 }),
    catch: () =>
      new VisualEvidenceCaptureError({
        reason: "navigation-failed",
        message: "Could not create an isolated browser context for the screenshot.",
      }),
  });

  return yield* Effect.gen(function* () {
    const page = yield* Effect.tryPromise({
      try: () => context.newPage(),
      catch: () =>
        new VisualEvidenceCaptureError({
          reason: "navigation-failed",
          message: "Could not open a browser page for the screenshot.",
        }),
    });
    yield* Effect.tryPromise({
      try: () => page.goto(input.url, { waitUntil: "domcontentloaded", timeout }),
      catch: () =>
        new VisualEvidenceCaptureError({
          reason: "navigation-failed",
          message: `Could not load ${input.url} on the backend browser.`,
        }),
    });
    yield* settleVisuals(page);

    if (input.capture.mode === "element") {
      const locator = page.locator(input.capture.locator!).first();
      yield* Effect.tryPromise({
        try: () => locator.waitFor({ state: "visible", timeout }),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "element-not-found",
            message: `The changed region was not visible: ${input.capture.locator!}`,
          }),
      });
      const box = yield* Effect.tryPromise({
        try: () => locator.boundingBox(),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "element-not-found",
            message: `Could not measure the changed region: ${input.capture.locator!}`,
          }),
      });
      const data = yield* Effect.tryPromise({
        try: () =>
          locator.screenshot({
            type: "jpeg",
            quality: 88,
            animations: "disabled",
            caret: "hide",
            timeout,
          }),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "element-not-found",
            message: `Could not capture the changed region: ${input.capture.locator!}`,
          }),
      });
      return {
        data: Buffer.from(data),
        width: Math.max(1, Math.round(box?.width ?? viewport.width)),
        height: Math.max(1, Math.round(box?.height ?? viewport.height)),
      } satisfies CapturedImage;
    }

    const dimensions = yield* Effect.tryPromise({
      try: () =>
        page.evaluate(`({
          width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
          height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
        })`) as Promise<{ width: number; height: number }>,
      catch: () =>
        new VisualEvidenceCaptureError({
          reason: "navigation-failed",
          message: "Could not measure the rendered page.",
        }),
    }).pipe(Effect.orElseSucceed(() => ({ width: viewport.width, height: viewport.height })));
    const data = yield* Effect.tryPromise({
      try: () =>
        page.screenshot({
          type: "jpeg",
          quality: 88,
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          timeout,
        }),
      catch: () =>
        new VisualEvidenceCaptureError({
          reason: "navigation-failed",
          message: "The page loaded, but the backend browser could not capture it.",
        }),
    });
    return { data: Buffer.from(data), ...dimensions } satisfies CapturedImage;
  }).pipe(Effect.ensuring(Effect.promise(() => context.close()).pipe(Effect.ignore)));
});

const settleVisuals = (page: Page) =>
  Effect.all(
    [
      Effect.promise(() =>
        page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()"),
      ).pipe(Effect.ignore),
      Effect.promise(() =>
        page.addStyleTag({
          content:
            "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}",
        }),
      ).pipe(Effect.ignore),
    ],
    { concurrency: 2 },
  ).pipe(Effect.asVoid);

export interface VisualEvidenceShape {
  readonly capture: (
    threadId: ThreadId,
    input: VisualEvidenceCaptureInput,
  ) => Effect.Effect<VisualEvidenceCaptureResult, VisualEvidenceCaptureError>;
  readonly take: (threadId: ThreadId) => Effect.Effect<ReadonlyArray<ChatImageAttachment>>;
  readonly clear: (threadId: ThreadId) => Effect.Effect<void>;
}

export class VisualEvidence extends Context.Service<VisualEvidence, VisualEvidenceShape>()(
  "t3/visualEvidence/VisualEvidence",
) {}

export const takePendingVisualEvidence = Effect.fn("VisualEvidence.takePending")(function* (
  threadId: ThreadId,
) {
  return yield* Effect.sync(() => {
    const pending = pendingEvidenceByThread.get(threadId) ?? [];
    pendingEvidenceByThread.delete(threadId);
    return pending.map(({ attachment }) => attachment);
  });
});

export const clearPendingVisualEvidence = Effect.fn("VisualEvidence.clearPending")(function* (
  threadId: ThreadId,
) {
  const pending = yield* Effect.sync(() => {
    const current = pendingEvidenceByThread.get(threadId) ?? [];
    pendingEvidenceByThread.delete(threadId);
    return current;
  });
  yield* Effect.forEach(
    pending,
    (evidence) =>
      Effect.promise(() => NodeFS.promises.rm(evidence.path, { force: true })).pipe(Effect.ignore),
    { concurrency: "unbounded", discard: true },
  );
});

export const recordPendingVisualEvidence = Effect.fn("VisualEvidence.recordPending")(function* (
  threadId: ThreadId,
  evidence: PendingEvidence,
) {
  const evicted = yield* Effect.sync(() => {
    const previous = pendingEvidenceByThread.get(threadId) ?? [];
    const nextForThread = [...previous, evidence].slice(-MAX_PENDING_EVIDENCE_PER_THREAD);
    pendingEvidenceByThread.set(threadId, nextForThread);
    return previous.slice(0, Math.max(0, previous.length + 1 - nextForThread.length));
  });
  yield* Effect.forEach(
    evicted,
    (item) =>
      Effect.promise(() => NodeFS.promises.rm(item.path, { force: true })).pipe(Effect.ignore),
    { concurrency: "unbounded", discard: true },
  );
});

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig;

  const capture: VisualEvidenceShape["capture"] = Effect.fn("VisualEvidence.capture")(
    function* (threadId, input) {
      const executablePath = resolveVisualEvidenceBrowserExecutable();
      if (!executablePath) {
        return yield* new VisualEvidenceCaptureError({
          reason: "browser-unavailable",
          message:
            "No backend Chromium was found. Set T3CODE_BROWSER_EXECUTABLE or install Chromium with Playwright on the T3 host.",
        });
      }
      const url = yield* Effect.try({
        try: () => resolveVisualEvidenceTarget(input.target),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "invalid-target",
            message: "The screenshot target is not a valid HTTP or HTTPS URL.",
          }),
      });
      const browser = yield* Effect.tryPromise({
        try: () =>
          chromium.launch({
            executablePath,
            headless: true,
            args: [
              "--disable-dev-shm-usage",
              ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
            ],
          }),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "browser-unavailable",
            message: "The backend Chromium installation could not be launched.",
          }),
      });
      const image = yield* capturePage({ browser, capture: input, url }).pipe(
        Effect.ensuring(Effect.promise(() => browser.close()).pipe(Effect.ignore)),
      );
      if (image.data.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
        return yield* new VisualEvidenceCaptureError({
          reason: "image-too-large",
          message: "The screenshot exceeds the 10 MB message attachment limit.",
        });
      }
      const id = createAttachmentId(threadId);
      if (!id) {
        return yield* new VisualEvidenceCaptureError({
          reason: "storage-failed",
          message: "Could not create an attachment identifier for this thread.",
        });
      }
      const attachment: ChatImageAttachment = {
        type: "image",
        id,
        name: attachmentName(input.label, input.mode),
        mimeType: "image/jpeg",
        sizeBytes: image.data.byteLength,
      };
      const relativePath = attachmentRelativePath(attachment);
      if (relativePath === null) {
        return yield* new VisualEvidenceCaptureError({
          reason: "storage-failed",
          message: "Could not resolve storage for the captured screenshot.",
        });
      }
      const destination = NodePath.join(config.attachmentsDir, relativePath);
      yield* Effect.tryPromise({
        try: () => NodeFS.promises.writeFile(destination, image.data),
        catch: () =>
          new VisualEvidenceCaptureError({
            reason: "storage-failed",
            message: "The screenshot was captured but could not be saved as a message attachment.",
          }),
      });

      yield* recordPendingVisualEvidence(threadId, { attachment, path: destination });

      return {
        attachment,
        mode: input.mode,
        label: input.label,
        url,
        width: image.width,
        height: image.height,
        screenshot: { mimeType: "image/jpeg", data: image.data.toString("base64") },
      };
    },
  );

  const take: VisualEvidenceShape["take"] = Effect.fn("VisualEvidence.take")(function* (threadId) {
    return yield* takePendingVisualEvidence(threadId);
  });

  const clear: VisualEvidenceShape["clear"] = Effect.fn("VisualEvidence.clear")(
    function* (threadId) {
      yield* clearPendingVisualEvidence(threadId);
    },
  );

  return VisualEvidence.of({ capture, take, clear });
});

export const layer = Layer.effect(VisualEvidence, make);
