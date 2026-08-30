// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { ThreadId, type ChatImageAttachment } from "@t3tools/contracts";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  clearPendingVisualEvidence,
  recordPendingVisualEvidence,
  resolveVisualEvidenceBrowserExecutable,
  resolveVisualEvidenceTarget,
  takePendingVisualEvidence,
} from "./VisualEvidence.ts";

const tempDirs: Array<string> = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
});

describe("backend visual evidence", () => {
  it("prefers an explicitly configured backend browser", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-browser-resolver-"));
    tempDirs.push(dir);
    const executable = NodePath.join(dir, "chromium");
    NodeFS.writeFileSync(executable, "#!/bin/sh\n");
    NodeFS.chmodSync(executable, 0o755);

    expect(
      resolveVisualEvidenceBrowserExecutable({
        T3CODE_BROWSER_EXECUTABLE: executable,
        PATH: "",
      }),
    ).toBe(executable);
  });

  it("resolves environment ports on the backend loopback interface", () => {
    expect(
      resolveVisualEvidenceTarget({
        kind: "environment-port",
        port: 5173,
        path: "pricing?annual=true",
      }),
    ).toBe("http://127.0.0.1:5173/pricing?annual=true");
  });

  effectIt("keeps only three pending captures and deletes evicted files", () =>
    Effect.gen(function* () {
      const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-evidence-pending-"));
      tempDirs.push(dir);
      const threadId = ThreadId.make("thread-evidence-test");

      for (let index = 0; index < 4; index += 1) {
        const path = NodePath.join(dir, `${index}.jpg`);
        NodeFS.writeFileSync(path, "image");
        const attachment: ChatImageAttachment = {
          type: "image",
          id: `thread-evidence-test-00000000-0000-4000-8000-00000000000${index}`,
          name: `${index}.jpg`,
          mimeType: "image/jpeg",
          sizeBytes: 5,
        };
        yield* recordPendingVisualEvidence(threadId, { attachment, path });
      }

      expect(NodeFS.existsSync(NodePath.join(dir, "0.jpg"))).toBe(false);
      const pending = yield* takePendingVisualEvidence(threadId);
      expect(pending.map(({ name }) => name)).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
      yield* clearPendingVisualEvidence(threadId);
    }),
  );
});
