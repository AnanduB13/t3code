import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  type ClientOrchestrationCommand,
  type IsoDateTime,
  type OrchestrationCommand,
  OrchestrationDispatchCommandError,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_MAX_PDF_BYTES,
} from "@t3tools/contracts";

import {
  createAttachmentId,
  resolveAttachmentPath,
  resolvePdfTextPath,
} from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { parseBase64DataUrl } from "../imageMime.ts";
import { extractPdfText } from "../pdfTextExtraction.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

export const canonicalizeClientCommandTimestamps = (
  command: ClientOrchestrationCommand,
  receivedAt: IsoDateTime,
): ClientOrchestrationCommand => {
  const canonicalCommand =
    "createdAt" in command
      ? {
          ...command,
          createdAt: receivedAt,
        }
      : command;

  if (canonicalCommand.type !== "thread.turn.start" || !canonicalCommand.bootstrap?.createThread) {
    return canonicalCommand;
  }

  return {
    ...canonicalCommand,
    bootstrap: {
      ...canonicalCommand.bootstrap,
      createThread: {
        ...canonicalCommand.bootstrap.createThread,
        createdAt: receivedAt,
      },
    },
  };
};

export const normalizeDispatchCommand = (command: ClientOrchestrationCommand) =>
  Effect.gen(function* () {
    const receivedAt = DateTime.formatIso(yield* DateTime.now);
    const canonicalCommand = canonicalizeClientCommandTimestamps(command, receivedAt);
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const serverConfig = yield* ServerConfig;
    const workspacePaths = yield* WorkspacePaths.WorkspacePaths;

    const normalizeProjectWorkspaceRoot = (workspaceRoot: string) =>
      workspacePaths.normalizeWorkspaceRoot(workspaceRoot).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: cause.message,
            }),
        ),
      );

    const normalizeProjectWorkspaceRootForCreate = (
      workspaceRoot: string,
      createIfMissing: boolean | undefined,
    ) =>
      workspacePaths
        .normalizeWorkspaceRoot(workspaceRoot, {
          createIfMissing: createIfMissing === true,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new OrchestrationDispatchCommandError({
                message: cause.message,
              }),
          ),
        );

    if (canonicalCommand.type === "project.create") {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRootForCreate(
          canonicalCommand.workspaceRoot,
          canonicalCommand.createWorkspaceRootIfMissing,
        ),
        createWorkspaceRootIfMissing: canonicalCommand.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
    }

    if (
      canonicalCommand.type === "project.meta.update" &&
      canonicalCommand.workspaceRoot !== undefined
    ) {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(canonicalCommand.workspaceRoot),
      } satisfies OrchestrationCommand;
    }

    if (canonicalCommand.type !== "thread.turn.start") {
      return canonicalCommand as OrchestrationCommand;
    }

    const normalizedAttachments = yield* Effect.forEach(
      canonicalCommand.message.attachments,
      (attachment) =>
        Effect.gen(function* () {
          const parsed = parseBase64DataUrl(attachment.dataUrl);
          const expectedMimeType = attachment.type === "pdf" ? "application/pdf" : null;
          const validMimeType =
            parsed &&
            (attachment.type === "image"
              ? parsed.mimeType.startsWith("image/")
              : parsed.mimeType === expectedMimeType);
          if (!parsed || !validMimeType) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Invalid ${attachment.type} attachment payload for '${attachment.name}'.`,
            });
          }

          const bytes = Buffer.from(parsed.base64, "base64");
          const maximumBytes =
            attachment.type === "pdf"
              ? PROVIDER_SEND_TURN_MAX_PDF_BYTES
              : PROVIDER_SEND_TURN_MAX_IMAGE_BYTES;
          if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
            return yield* new OrchestrationDispatchCommandError({
              message: `${attachment.type === "pdf" ? "PDF" : "Image"} attachment '${attachment.name}' is empty or too large.`,
            });
          }

          const attachmentId = createAttachmentId(canonicalCommand.threadId);
          if (!attachmentId) {
            return yield* new OrchestrationDispatchCommandError({
              message: "Failed to create a safe attachment id.",
            });
          }

          const persistedAttachment =
            attachment.type === "pdf"
              ? {
                  type: "pdf" as const,
                  id: attachmentId,
                  name: attachment.name,
                  mimeType: "application/pdf" as const,
                  sizeBytes: bytes.byteLength,
                }
              : {
                  type: "image" as const,
                  id: attachmentId,
                  name: attachment.name,
                  mimeType: parsed.mimeType.toLowerCase(),
                  sizeBytes: bytes.byteLength,
                };

          const extractedPdf =
            attachment.type === "pdf"
              ? yield* Effect.tryPromise({
                  try: () => extractPdfText(bytes),
                  catch: (cause) =>
                    new OrchestrationDispatchCommandError({
                      message:
                        cause instanceof Error
                          ? `Could not extract '${attachment.name}': ${cause.message}`
                          : `Could not extract '${attachment.name}'.`,
                    }),
                })
              : null;

          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment: persistedAttachment,
          });
          if (!attachmentPath) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Failed to resolve persisted path for '${attachment.name}'.`,
            });
          }
          const pdfTextPath =
            extractedPdf === null
              ? null
              : resolvePdfTextPath({
                  attachmentsDir: serverConfig.attachmentsDir,
                  attachmentId,
                });
          if (extractedPdf !== null && pdfTextPath === null) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Failed to resolve extracted text path for '${attachment.name}'.`,
            });
          }

          yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to create attachment directory for '${attachment.name}'.`,
                }),
            ),
          );
          yield* fileSystem.writeFile(attachmentPath, bytes).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to persist attachment '${attachment.name}'.`,
                }),
            ),
          );
          if (extractedPdf !== null && pdfTextPath !== null) {
            yield* fileSystem.writeFileString(pdfTextPath, extractedPdf.text).pipe(
              Effect.mapError(
                () =>
                  new OrchestrationDispatchCommandError({
                    message: `Failed to persist extracted text for '${attachment.name}'.`,
                  }),
              ),
            );
          }

          return persistedAttachment;
        }),
      { concurrency: 1 },
    );

    return {
      ...canonicalCommand,
      message: {
        ...canonicalCommand.message,
        attachments: normalizedAttachments,
      },
    } satisfies OrchestrationCommand;
  });
