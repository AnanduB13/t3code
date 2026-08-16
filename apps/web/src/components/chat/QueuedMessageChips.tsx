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
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import type { MessageId, OrchestrationQueuedMessage } from "@t3tools/contracts";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Queued follow-up messages held server-side while a turn runs. Each chip
 * offers Steer (send the selected prefix at the provider's next accepted
 * boundary) and delete; the queue otherwise drains in order after completion.
 */
export const QueuedMessageChips = memo(function QueuedMessageChips({
  queuedMessages,
  steerDisabled,
  onSteer,
  onRemove,
  onUpdate,
  onReorder,
}: {
  readonly queuedMessages: ReadonlyArray<OrchestrationQueuedMessage>;
  readonly steerDisabled?: boolean;
  readonly onSteer: (messageId: MessageId) => void;
  readonly onRemove: (messageId: MessageId) => void;
  readonly onUpdate: (messageId: MessageId, text: string) => void;
  readonly onReorder: (messageIds: ReadonlyArray<MessageId>) => void;
}) {
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
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
                        {queuedMessage.text.length > 0
                          ? queuedMessage.text
                          : `${queuedMessage.attachments.length} attachment(s)`}
                      </span>
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
                              aria-label={
                                index === 0
                                  ? "Steer queued prompt 1"
                                  : `Steer queued prompts 1 through ${index + 1}`
                              }
                              onClick={() => onSteer(queuedMessage.messageId)}
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
                            : index === 0
                              ? "Send this prompt after the current provider step"
                              : `Send prompts 1–${index + 1} in order after the current provider step`}
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
