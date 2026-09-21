import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { projectComposerContextForProvider } from "@t3tools/shared/composerContextReferences";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { type ComposerImageAttachment, useComposerDraftStore } from "../../composerDraftStore";
import {
  collectInlineContextIds,
  inlineContextReferenceReplacement,
} from "../../lib/composerContextReferences";
import { buildMessageContext, orderComposerAttachments } from "../../lib/composerContextRecords";
import {
  type CompressImageFileResult,
  prepareImageForAttachment,
} from "../../lib/imageCompression";
import { attachComposerImages } from "./composerImageAttachments";
import { pendingDraftWork } from "./pendingDraftWork";

vi.mock("../../lib/imageCompression", () => ({ prepareImageForAttachment: vi.fn() }));

const target = {
  environmentId: EnvironmentId.make("image-order-env"),
  threadId: ThreadId.make("image-order-thread"),
};
const draftKey = "image-order-test";
let retainedImages: Map<string, ComposerImageAttachment>;

function deferredImage() {
  let resolve!: (result: CompressImageFileResult) => void;
  const promise = new Promise<CompressImageFileResult>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function paste(file: File, start: number, end = start) {
  return attachComposerImages({
    files: [file],
    draftTarget: target,
    draftKey,
    retainedImages,
    insertReferences: (references) => {
      const store = useComposerDraftStore.getState();
      const prompt = store.getComposerDraft(target)?.prompt ?? "";
      const edit = inlineContextReferenceReplacement(prompt, { start, end }, references);
      store.setPrompt(
        target,
        `${prompt.slice(0, edit.start)}${edit.text}${prompt.slice(edit.end)}`,
      );
      return true;
    },
  });
}

beforeEach(() => {
  retainedImages = new Map();
  vi.mocked(prepareImageForAttachment).mockReset();
  useComposerDraftStore.setState({ draftsByThreadKey: {} });
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${crypto.randomUUID()}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("image paste ordering", () => {
  it("keeps same-named images between their captions when preparation finishes in reverse order", async () => {
    const first = new File(["good screenshot"], "image.png", { type: "image/png" });
    const second = new File(["bad screenshot"], "image.png", { type: "image/png" });
    const pendingFirst = deferredImage();
    const pendingSecond = deferredImage();
    vi.mocked(prepareImageForAttachment)
      .mockReturnValueOnce(pendingFirst.promise)
      .mockReturnValueOnce(pendingSecond.promise);
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, "as you can see in the image ");
    const firstPaste = paste(first, store.getComposerDraft(target)!.prompt.length);
    const firstPrompt = store.getComposerDraft(target)!.prompt;
    expect(collectInlineContextIds(firstPrompt)).toHaveLength(1);
    store.setPrompt(target, `${firstPrompt}this is good, but as you can see in this image `);
    const secondPaste = paste(second, store.getComposerDraft(target)!.prompt.length);
    store.setPrompt(target, `${store.getComposerDraft(target)!.prompt}is not good`);
    const expectedPrompt = store.getComposerDraft(target)!.prompt;

    pendingSecond.resolve({ ok: true, file: second, recompressed: false });
    await secondPaste;
    expect(pendingDraftWork.has(draftKey)).toBe(true);
    pendingFirst.resolve({ ok: true, file: first, recompressed: false });
    await firstPaste;
    expect(pendingDraftWork.has(draftKey)).toBe(false);

    const draft = store.getComposerDraft(target)!;
    expect(draft.prompt).toBe(expectedPrompt);
    const ordered = orderComposerAttachments(draft.prompt, draft.images);
    expect(ordered.map((image) => image.file)).toEqual([first, second]);
    const context = buildMessageContext({
      terminalContexts: [],
      reviewComments: [],
      previewAnnotations: [],
      attachments: ordered.map((attachment, index) => ({
        attachment,
        attachmentId: `uploaded-${index + 1}`,
      })),
    })!;
    const providerPrompt = projectComposerContextForProvider({
      text: draft.prompt,
      records: context.records,
    });
    const [firstId, secondId] = collectInlineContextIds(draft.prompt);
    expect(providerPrompt.indexOf(firstId!)).toBeLessThan(providerPrompt.indexOf("this is good"));
    expect(providerPrompt.indexOf(secondId!)).toBeGreaterThan(
      providerPrompt.indexOf("this is good"),
    );
    expect(providerPrompt.indexOf(secondId!)).toBeLessThan(providerPrompt.indexOf("is not good"));
    expect(context.records).toEqual([
      expect.objectContaining({ contextId: firstId, attachmentId: "uploaded-1" }),
      expect.objectContaining({ contextId: secondId, attachmentId: "uploaded-2" }),
    ]);
    // Moving a chip changes binary order too; upload completion order never wins.
    expect(
      orderComposerAttachments(
        `[second](t3-context://v1/image/${secondId}) [first](t3-context://v1/image/${firstId})`,
        draft.images,
      ).map((image) => image.file),
    ).toEqual([second, first]);
  });

  it("replaces selected text immediately and leaves later typing untouched", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const ready = deferredImage();
    vi.mocked(prepareImageForAttachment).mockReturnValue(ready.promise);
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, "before replace after");
    const attachment = paste(file, 7, 14);
    expect(store.getComposerDraft(target)!.prompt).not.toContain("replace");
    store.setPrompt(target, `${store.getComposerDraft(target)!.prompt} more text`);
    const expected = store.getComposerDraft(target)!.prompt;
    ready.resolve({ ok: true, file, recompressed: false });
    await attachment;
    expect(store.getComposerDraft(target)!.prompt).toBe(expected);
  });

  it("does not resurrect an image removed during preparation, but retains its bytes for undo", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const ready = deferredImage();
    vi.mocked(prepareImageForAttachment).mockReturnValue(ready.promise);
    const attachment = paste(file, 0);
    const store = useComposerDraftStore.getState();
    const [contextId] = collectInlineContextIds(store.getComposerDraft(target)!.prompt);
    store.setPrompt(target, "changed my mind");
    ready.resolve({ ok: true, file, recompressed: false });
    await attachment;
    expect(store.getComposerDraft(target)!.images).toEqual([]);
    expect(store.getComposerDraft(target)!.prompt).toBe("changed my mind");
    expect(retainedImages.get(contextId!)?.file).toBe(file);
  });

  it("removes a failed placeholder without removing neighboring text", async () => {
    const file = new File(["image"], "broken.png", { type: "image/png" });
    vi.mocked(prepareImageForAttachment).mockResolvedValue({ ok: false, reason: "unreadable" });
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, "before after");
    const result = await paste(file, 7);
    expect(result.error).toContain("could not be read");
    expect(store.getComposerDraft(target)!.prompt).toBe("before after");
    expect(store.getComposerDraft(target)!.images).toEqual([]);
    expect(pendingDraftWork.has(draftKey)).toBe(false);
  });
  it("keeps preparation in its original draft when another thread is edited", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const ready = deferredImage();
    vi.mocked(prepareImageForAttachment).mockReturnValue(ready.promise);
    const attachment = paste(file, 0);
    const otherTarget = { ...target, threadId: ThreadId.make("other-thread") };
    const store = useComposerDraftStore.getState();
    store.setPrompt(otherTarget, "Another conversation");
    ready.resolve({ ok: true, file, recompressed: false });
    await attachment;
    expect(store.getComposerDraft(target)!.images[0]?.file).toBe(file);
    expect(store.getComposerDraft(otherTarget)!.prompt).toBe("Another conversation");
    expect(store.getComposerDraft(otherTarget)!.images).toEqual([]);
  });

  it("keeps two intentional pastes of the same file as separate inline images", async () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    vi.mocked(prepareImageForAttachment).mockResolvedValue({ ok: true, file, recompressed: false });
    await paste(file, 0);
    const store = useComposerDraftStore.getState();
    await paste(file, store.getComposerDraft(target)!.prompt.length);
    const draft = store.getComposerDraft(target)!;
    expect(draft.images).toHaveLength(2);
    expect(new Set(draft.images.map((image) => image.id)).size).toBe(2);
    expect(orderComposerAttachments(draft.prompt, draft.images)).toEqual(draft.images);
  });

  it.each([true, false])(
    "preserves question attachments only while their question remains active (%s)",
    async (active) => {
      const file = new File(["image"], "image.png", { type: "image/png" });
      const ready = deferredImage();
      vi.mocked(prepareImageForAttachment).mockReturnValue(ready.promise);
      const attachment = attachComposerImages({
        files: [file],
        draftTarget: target,
        draftKey,
        retainedImages,
        insertReferences: () => false,
        canAttach: () => active,
      });
      ready.resolve({ ok: true, file, recompressed: false });
      expect((await attachment).insertedReferences).toBe(false);
      const draft = useComposerDraftStore.getState().getComposerDraft(target);
      expect(draft?.images ?? []).toHaveLength(active ? 1 : 0);
      expect(draft?.prompt ?? "").toBe("");
    },
  );
});
