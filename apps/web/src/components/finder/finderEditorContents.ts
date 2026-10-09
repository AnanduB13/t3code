import type { ProjectReadFileResult } from "@t3tools/contracts";

export type FinderEditorContents =
  | { readonly ready: false }
  | { readonly ready: true; readonly contents: string };

export function resolveFinderEditorContents(input: {
  readonly requestedPath: string | null;
  readonly file: ProjectReadFileResult | null;
  readonly localContents: string;
  readonly dirty: boolean;
}): FinderEditorContents {
  if (!input.file || input.file.relativePath !== input.requestedPath) return { ready: false };
  return {
    ready: true,
    contents: input.dirty ? input.localContents : input.file.contents,
  };
}
