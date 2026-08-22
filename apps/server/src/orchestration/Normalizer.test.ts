// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";
import { it as effectIt } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  CommandId,
  type ClientOrchestrationCommand,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { canonicalizeClientCommandTimestamps, normalizeDispatchCommand } from "./Normalizer.ts";

const clientCreatedAt = "2031-01-01T00:00:00.000Z";
const serverReceivedAt = "2026-07-18T00:00:00.000Z";

function makePdfDataUrl(text: string): string {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return `data:application/pdf;base64,${Buffer.from(body, "ascii").toString("base64")}`;
}

describe("canonicalizeClientCommandTimestamps", () => {
  it("replaces a client command timestamp with the server receipt timestamp", () => {
    const command: ClientOrchestrationCommand = {
      type: "project.create",
      commandId: CommandId.make("command-1"),
      projectId: ProjectId.make("project-1"),
      title: "Clock-safe project",
      workspaceRoot: "/tmp/clock-safe-project",
      createdAt: clientCreatedAt,
    };

    expect(canonicalizeClientCommandTimestamps(command, serverReceivedAt)).toEqual({
      ...command,
      createdAt: serverReceivedAt,
    });
  });

  it("replaces both timestamps when the first turn bootstraps a thread", () => {
    const command: ClientOrchestrationCommand = {
      type: "thread.turn.start",
      commandId: CommandId.make("command-2"),
      threadId: ThreadId.make("thread-1"),
      message: {
        messageId: MessageId.make("message-1"),
        role: "user",
        text: "Start a thread",
        attachments: [],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      bootstrap: {
        createThread: {
          projectId: ProjectId.make("project-1"),
          title: "Clock-safe thread",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.4",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: clientCreatedAt,
        },
      },
      createdAt: clientCreatedAt,
    };

    const result = canonicalizeClientCommandTimestamps(command, serverReceivedAt);

    expect(result.type).toBe("thread.turn.start");
    if (result.type !== "thread.turn.start") {
      throw new Error("Expected a thread.turn.start command");
    }
    expect(result.createdAt).toBe(serverReceivedAt);
    expect(result.bootstrap?.createThread?.createdAt).toBe(serverReceivedAt);
  });
});

describe("normalizeDispatchCommand PDF attachments", () => {
  effectIt.effect("persists the original PDF and its complete extracted-text sidecar", () => {
    let tempDir: string | null = null;
    return Effect.gen(function* () {
      tempDir = yield* Effect.sync(() =>
        NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-normalizer-pdf-")),
      );
      const testLayer = Layer.mergeAll(
        ServerConfig.layerTest(tempDir, tempDir),
        WorkspacePaths.layer,
      ).pipe(Layer.provideMerge(NodeServices.layer));
      const command: ClientOrchestrationCommand = {
        type: "thread.turn.start",
        commandId: CommandId.make("command-pdf"),
        threadId: ThreadId.make("thread-pdf"),
        message: {
          messageId: MessageId.make("message-pdf"),
          role: "user",
          text: "Read this PDF",
          attachments: [
            {
              type: "pdf",
              name: "booking.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1_000,
              dataUrl: makePdfDataUrl("Booking reference NL2221525978142"),
            },
          ],
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: clientCreatedAt,
      };

      const normalized = yield* Effect.gen(function* () {
        const result = yield* normalizeDispatchCommand(command);
        const config = yield* ServerConfig.ServerConfig;
        return { result, attachmentsDir: config.attachmentsDir };
      }).pipe(Effect.provide(testLayer));
      expect(normalized.result.type).toBe("thread.turn.start");
      if (normalized.result.type !== "thread.turn.start") return;
      const attachment = normalized.result.message.attachments[0];
      expect(attachment?.type).toBe("pdf");
      if (!attachment || attachment.type !== "pdf") return;
      expect(
        NodeFS.readFileSync(NodePath.join(normalized.attachmentsDir, `${attachment.id}.pdf`)),
      ).toBeInstanceOf(Buffer);
      expect(
        NodeFS.readFileSync(
          NodePath.join(normalized.attachmentsDir, `${attachment.id}.pdf.txt`),
          "utf8",
        ),
      ).toContain("Booking reference NL2221525978142");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (tempDir !== null) NodeFS.rmSync(tempDir, { recursive: true, force: true });
        }),
      ),
    );
  });
});
