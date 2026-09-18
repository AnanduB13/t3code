import { memo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  CornerUpRightIcon,
  GripVerticalIcon,
  FileTextIcon,
  ImageIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { MessageId, OrchestrationQueuedMessage } from "@t3tools/contracts";

import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Queued follow-up messages held server-side while a turn runs. Each chip
 * offers Steer (send explicitly selected prompts at the provider's next accepted
 * boundary) and delete; the queue otherwise drains in order after completion.
 */
export const QueuedMessageChips = memo(function QueuedMessageChips({
  queuedMessages,
  attachmentUrlById,
  steerDisabled,
  onSteer,
  onRemove,
  onUpdate,
  onReorder,
}: {
  readonly queuedMessages: ReadonlyArray<OrchestrationQueuedMessage>;
  readonly attachmentUrlById?: ReadonlyMap<string, string>;
  readonly steerDisabled?: boolean;
  readonly onSteer: (messageId: MessageId, messageIds?: ReadonlyArray<MessageId>) => void;
  readonly onRemove: (messageId: MessageId) => void;
  readonly onUpdate: (messageId: MessageId, text: string) => void;
  readonly onReorder: (messageIds: ReadonlyArray<MessageId>) => void;
}) {
  const [steerSelection, setSteerSelection] = useState<ReadonlyArray<MessageId> | null>(null);
  const selectedMessages = queuedMessages.filter((message) =>
    steerSelection?.includes(message.messageId),
  );
  const [editingId, setEditingId] = useState<MessageId | null>(null);
  const [draftText, setDraftText] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (queuedMessages.length === 0) {
    return null;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return;
    const overId = String(event.over.id);
    const messageIds = queuedMessages.map((message) => message.messageId);
    const fromIndex = messageIds.findIndex((messageId) => messageId === String(event.active.id));
    const toIndex = messageIds.findIndex((messageId) => messageId === overId);
    if (fromIndex === -1 || toIndex === -1) return;
    onReorder(arrayMove([...messageIds], fromIndex, toIndex));
  };

  const saveEdit = (queuedMessage: OrchestrationQueuedMessage) => {
    if (draftText.trim().length === 0 && queuedMessage.attachments.length === 0) return;
    onUpdate(queuedMessage.messageId, draftText);
    setEditingId(null);
  };

  return (
    <section
      aria-label="Prompt queue"
      className="chat-composer-glass pointer-events-auto relative z-0 mx-auto -mb-3 w-[calc(100%_-_1.5rem)] max-w-[46.5rem] overflow-hidden rounded-t-2xl border border-border/70 pb-3 shadow-sm"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={queuedMessages.map((message) => message.messageId)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="divide-y divide-border/60">
            {queuedMessages.map((queuedMessage, index) => (
              <SortableQueuedMessageRow key={queuedMessage.messageId} id={queuedMessage.messageId}>
                {({ attributes, listeners, setNodeRef, style, isDragging }) => (
                  <li
                    ref={setNodeRef}
                    style={style}
                    className={`flex min-w-0 items-center gap-2 px-3 py-2 ${isDragging ? "relative z-10 bg-card shadow-md" : ""}`}
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground active:cursor-grabbing"
                            aria-label={`Reorder queued prompt ${index + 1}`}
                            {...attributes}
                            {...listeners}
                          />
                        }
                      >
                        <GripVerticalIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipPopup side="top">Drag to reorder prompt {index + 1}</TooltipPopup>
                    </Tooltip>
                    {editingId === queuedMessage.messageId ? (
                      <textarea
                        autoFocus
                        rows={2}
                        value={draftText}
                        onChange={(event) => setDraftText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditingId(null);
                          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                            saveEdit(queuedMessage);
                          }
                        }}
                        aria-label={`Edit queued prompt ${index + 1}`}
                        className="min-h-10 min-w-0 flex-1 resize-y rounded-md border border-border/70 bg-background/70 px-2 py-1.5 text-[13px] leading-5 outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                      />
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {queuedMessage.attachments.length > 0 ? (
                          <span
                            className="flex shrink-0 items-center -space-x-1"
                            aria-label={`${queuedMessage.attachments.length} queued attachment${queuedMessage.attachments.length === 1 ? "" : "s"}: ${queuedMessage.attachments.map((attachment) => attachment.name).join(", ")}`}
                          >
                            {queuedMessage.attachments.slice(0, 3).map((attachment) => {
                              const attachmentUrl = attachmentUrlById?.get(attachment.id);
                              return attachment.type === "image" && attachmentUrl ? (
                                <img
                                  key={attachment.id}
                                  src={attachmentUrl}
                                  alt=""
                                  title={attachment.name}
                                  className="size-6 rounded-md border border-border/80 bg-muted object-cover"
                                />
                              ) : (
                                <span
                                  key={attachment.id}
                                  title={attachment.name}
                                  className="flex size-6 items-center justify-center rounded-md border border-border/80 bg-muted text-muted-foreground"
                                >
                                  {attachment.type === "pdf" ? (
                                    <FileTextIcon className="size-3.5" />
                                  ) : (
                                    <ImageIcon className="size-3.5" />
                                  )}
                                </span>
                              );
                            })}
                            {queuedMessage.attachments.length > 3 ? (
                              <span className="relative flex size-6 items-center justify-center rounded-md border border-border/80 bg-muted text-[10px] text-muted-foreground">
                                +{queuedMessage.attachments.length - 3}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
                          {queuedMessage.text.length > 0
                            ? queuedMessage.text
                            : queuedMessage.attachments
                                .map((attachment) => attachment.name)
                                .join(", ")}
                        </span>
                      </div>
                    )}
                    <div className="flex shrink-0 items-center gap-1">
                      {editingId === queuedMessage.messageId ? (
                        <>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Save queued prompt"
                            disabled={
                              draftText.trim().length === 0 &&
                              queuedMessage.attachments.length === 0
                            }
                            onClick={() => saveEdit(queuedMessage)}
                          >
                            <CheckIcon className="size-3" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Cancel editing queued prompt"
                            onClick={() => setEditingId(null)}
                          >
                            <XIcon className="size-3" />
                          </Button>
                        </>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Edit queued message"
                                onClick={() => {
                                  setEditingId(queuedMessage.messageId);
                                  setDraftText(queuedMessage.text);
                                }}
                              />
                            }
                          >
                            <PencilIcon className="size-3" />
                          </TooltipTrigger>
                          <TooltipPopup side="top">Edit queued prompt</TooltipPopup>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={steerDisabled}
                              aria-label={`Steer queued prompt ${index + 1}`}
                              onClick={() => {
                                if (queuedMessages.length === 1) onSteer(queuedMessage.messageId);
                                else setSteerSelection([queuedMessage.messageId]);
                              }}
                            />
                          }
                        >
                          <CornerUpRightIcon className="size-3" />
                          Steer
                        </TooltipTrigger>
                        <TooltipPopup
                          side="top"
                          className="max-w-72 whitespace-normal leading-tight"
                        >
                          {steerDisabled
                            ? "Waiting for the agent to start"
                            : "Send this prompt into the active turn"}
                        </TooltipPopup>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              aria-label="Remove queued message"
                              onClick={() => onRemove(queuedMessage.messageId)}
                            />
                          }
                        >
                          <Trash2Icon className="size-3" />
                        </TooltipTrigger>
                        <TooltipPopup side="top">Remove from queue</TooltipPopup>
                      </Tooltip>
                    </div>
                  </li>
                )}
              </SortableQueuedMessageRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Dialog
        open={steerSelection !== null}
        onOpenChange={(open) => {
          if (!open) setSteerSelection(null);
        }}
      >
        <DialogPopup className="p-4">
          <DialogTitle>Choose prompts to steer</DialogTitle>
          <DialogDescription>
            Selected prompts are sent in queue order. Unselected prompts stay queued.
          </DialogDescription>
          <div className="my-4 max-h-64 space-y-2 overflow-y-auto">
            {queuedMessages.map((message, index) => (
              <label
                key={message.messageId}
                className="flex items-start gap-3 rounded-md border border-border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={steerSelection?.includes(message.messageId) ?? false}
                  onChange={(event) =>
                    setSteerSelection((current) =>
                      event.target.checked
                        ? [...(current ?? []), message.messageId]
                        : (current ?? []).filter((id) => id !== message.messageId),
                    )
                  }
                />
                <span className="min-w-0 whitespace-pre-wrap break-words">
                  {index + 1}.{" "}
                  {message.text ||
                    message.attachments.map((attachment) => attachment.name).join(", ")}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSteerSelection(null)}>
              Cancel
            </Button>
            <Button
              disabled={steerDisabled || selectedMessages.length === 0}
              onClick={() => {
                const target = selectedMessages.at(-1);
                if (!target) return;
                onSteer(
                  target.messageId,
                  selectedMessages.map((message) => message.messageId),
                );
                setSteerSelection(null);
              }}
            >
              Steer selected ({selectedMessages.length})
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </section>
  );
});

function SortableQueuedMessageRow({
  id,
  children,
}: {
  readonly id: MessageId;
  readonly children: (bag: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
    setNodeRef: ReturnType<typeof useSortable>["setNodeRef"];
    style: { transform: string | undefined; transition: string | undefined };
    isDragging: boolean;
  }) => ReactNode;
}) {
  const sortable = useSortable({ id });
  return children({
    attributes: sortable.attributes,
    listeners: sortable.listeners,
    setNodeRef: sortable.setNodeRef,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    },
    isDragging: sortable.isDragging,
  });
}
