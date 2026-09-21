import { PROVIDER_SEND_TURN_MAX_IMAGE_BYTES } from "@t3tools/contracts";

import {
  type ComposerImageAttachment,
  type ComposerThreadTarget,
  useComposerDraftStore,
} from "../../composerDraftStore";
import {
  collectInlineContextIds,
  type ComposerContextReference,
  toKindScopedComposerContextId,
} from "../../lib/composerContextReferences";
import { prepareImageForAttachment } from "../../lib/imageCompression";
import { randomUUID } from "../../lib/utils";
import { pendingDraftWork } from "./pendingDraftWork";

/** Reserve the paste positions before compression; completion only supplies their image bytes. */
export async function attachComposerImages(input: {
  files: ReadonlyArray<File>;
  draftTarget: ComposerThreadTarget;
  draftKey: string;
  insertReferences: (references: ReadonlyArray<ComposerContextReference>) => boolean;
  retainedImages: Map<string, ComposerImageAttachment>;
  canAttach?: () => boolean;
}): Promise<{ insertedReferences: boolean; error: string | null }> {
  const pending = input.files.map((file) => {
    const id = randomUUID();
    return {
      id,
      file,
      reference: {
        kind: "image",
        contextId: toKindScopedComposerContextId("image", id),
        label: file.name || "image",
      },
    };
  });
  pendingDraftWork.begin(input.draftKey);
  try {
    const insertedReferences = input.insertReferences(pending.map((image) => image.reference));
    let error: string | null = null;
    const preparedImages: ComposerImageAttachment[] = [];
    for (const { id, file } of pending) {
      const prepared = await prepareImageForAttachment(
        file,
        PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
      ).catch(() => ({ ok: false, reason: "unreadable" }) as const);
      const store = useComposerDraftStore.getState();
      if (!prepared.ok) {
        store.removeImage(input.draftTarget, id);
        error =
          prepared.reason === "unreadable"
            ? `'${file.name}' could not be read as an image.`
            : `'${file.name}' is too large to attach, even after compression.`;
        continue;
      }
      if (input.canAttach?.() === false) continue;
      const image: ComposerImageAttachment = {
        type: "image",
        id,
        name: prepared.file.name || "image",
        mimeType: prepared.file.type,
        sizeBytes: prepared.file.size,
        previewUrl: "",
        file: prepared.file,
      };
      preparedImages.push(image);
    }
    const store = useComposerDraftStore.getState();
    const referenced = new Set(
      collectInlineContextIds(store.getComposerDraft(input.draftTarget)?.prompt ?? ""),
    );
    const images = preparedImages.filter((image) => {
      if (input.canAttach?.() === false) return false;
      if (!insertedReferences) return true;
      const contextId = toKindScopedComposerContextId("image", image.id);
      input.retainedImages.set(contextId, image);
      // A deleted chip (or cleared draft) must not resurrect an attachment on completion.
      return referenced.has(contextId);
    });
    const accepted = new Set(
      store.addImages(
        input.draftTarget,
        images.map((image) => ({
          ...image,
          previewUrl: URL.createObjectURL(image.file),
        })),
        { allowDuplicates: true },
      ),
    );
    for (const image of images) {
      if (!accepted.has(image.id)) store.removeImage(input.draftTarget, image.id);
    }
    return { insertedReferences, error };
  } finally {
    pendingDraftWork.end(input.draftKey);
  }
}
