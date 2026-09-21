import type { PreviewAnnotationPayload } from "@t3tools/contracts";

import type { ComposerFileAttachment, ComposerImageAttachment } from "../../composerDraftStore";
import {
  fileContextReference,
  imageContextReference,
  previewAnnotationContextId,
} from "../../lib/composerContextRecords";

interface RetainedPreviewAnnotation {
  annotation: PreviewAnnotationPayload;
  image: ComposerImageAttachment | undefined;
}

export interface RetainedAttachmentContextPayloads {
  images: Map<string, ComposerImageAttachment>;
  files: Map<string, ComposerFileAttachment>;
  previewAnnotations: Map<string, RetainedPreviewAnnotation>;
}

export function reconcileAttachmentContextReferences(input: {
  referencedContextIds: ReadonlySet<string>;
  previousReferencedContextIds: ReadonlySet<string>;
  files: ReadonlyArray<ComposerFileAttachment>;
  images: ReadonlyArray<ComposerImageAttachment>;
  previewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  retained: RetainedAttachmentContextPayloads;
}): {
  imagesToRemove: string[];
  imagesToRestore: ComposerImageAttachment[];
  filesToRemove: string[];
  filesToRestore: ComposerFileAttachment[];
  annotationIdsToRemove: string[];
  annotationsToRestore: RetainedPreviewAnnotation[];
} {
  const annotationImageIds = new Set(input.previewAnnotations.map((annotation) => annotation.id));
  const liveImageContextIds = new Set(
    input.images.map((image) => imageContextReference(image).contextId),
  );
  const imagesToRemove: string[] = [];
  for (const image of input.images) {
    const contextId = imageContextReference(image).contextId;
    // Legacy images and annotation screenshots may never have had a standalone chip.
    if (
      annotationImageIds.has(image.id) ||
      !input.previousReferencedContextIds.has(contextId) ||
      input.referencedContextIds.has(contextId)
    )
      continue;
    input.retained.images.set(contextId, image);
    imagesToRemove.push(image.id);
  }
  const imagesToRestore = [...input.referencedContextIds].flatMap((contextId) => {
    if (liveImageContextIds.has(contextId)) return [];
    const image = input.retained.images.get(contextId);
    return image ? [image] : [];
  });
  const liveFileContextIds = new Set<string>(
    input.files.map((file) => fileContextReference(file).contextId),
  );
  const filesToRemove: string[] = [];
  for (const file of input.files) {
    const contextId = fileContextReference(file).contextId;
    if (input.referencedContextIds.has(contextId)) continue;
    input.retained.files.set(contextId, file);
    filesToRemove.push(file.id);
  }
  const filesToRestore = [...input.referencedContextIds].flatMap((contextId) => {
    if (liveFileContextIds.has(contextId)) return [];
    const file = input.retained.files.get(contextId);
    return file ? [file] : [];
  });

  const imagesById = new Map(input.images.map((image) => [image.id, image]));
  const liveAnnotationContextIds = new Set<string>(
    input.previewAnnotations.map((annotation) => previewAnnotationContextId(annotation.id)),
  );
  const annotationIdsToRemove: string[] = [];
  for (const annotation of input.previewAnnotations) {
    const contextId = previewAnnotationContextId(annotation.id);
    if (input.referencedContextIds.has(contextId)) continue;
    input.retained.previewAnnotations.set(contextId, {
      annotation,
      image: imagesById.get(annotation.id),
    });
    annotationIdsToRemove.push(annotation.id);
  }
  const annotationsToRestore = [...input.referencedContextIds].flatMap((contextId) => {
    if (liveAnnotationContextIds.has(contextId)) return [];
    const retained = input.retained.previewAnnotations.get(contextId);
    return retained ? [retained] : [];
  });

  return {
    imagesToRemove,
    imagesToRestore,
    filesToRemove,
    filesToRestore,
    annotationIdsToRemove,
    annotationsToRestore,
  };
}
