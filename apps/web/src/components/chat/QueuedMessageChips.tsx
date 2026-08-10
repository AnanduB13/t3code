import { memo } from "react";
import { CornerUpRightIcon, ListTreeIcon, Trash2Icon } from "lucide-react";
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
}: {
  readonly queuedMessages: ReadonlyArray<OrchestrationQueuedMessage>;
  readonly steerDisabled?: boolean;
  readonly onSteer: (messageId: MessageId) => void;
  readonly onRemove: (messageId: MessageId) => void;
}) {
  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Prompt queue"
      className="chat-composer-glass pointer-events-auto relative z-0 mx-auto -mb-3 w-[calc(100%_-_1.5rem)] max-w-[46.5rem] overflow-hidden rounded-t-2xl border border-border/70 pb-3 shadow-sm"
    >
      <ol className="divide-y divide-border/60">
        {queuedMessages.map((queuedMessage, index) => (
          <li key={queuedMessage.messageId} className="flex min-w-0 items-center gap-2 px-3 py-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground" />
                }
              >
                <ListTreeIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Queued prompt {index + 1}</TooltipPopup>
            </Tooltip>
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/90">
              {queuedMessage.text.length > 0
                ? queuedMessage.text
                : `${queuedMessage.attachments.length} attachment(s)`}
            </span>
            <div className="flex shrink-0 items-center gap-1">
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
                <TooltipPopup side="top" className="max-w-72 whitespace-normal leading-tight">
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
        ))}
      </ol>
    </section>
  );
});
