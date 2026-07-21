import { CornerDownRightIcon, ListEndIcon, Trash2Icon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface QueuedPromptPresentation {
  id: string;
  label: string;
}

interface QueuedPromptsProps {
  prompts: ReadonlyArray<QueuedPromptPresentation>;
  onSteer: (id: string) => void;
  onRemove: (id: string) => void;
}

export function QueuedPrompts({ prompts, onSteer, onRemove }: QueuedPromptsProps) {
  if (prompts.length === 0) return null;

  return (
    <div
      className="relative z-0 mx-auto w-full max-w-3xl space-y-1.5 pb-1.5 sm:pb-2"
      data-queued-prompts="true"
      aria-label="Queued messages"
    >
      {prompts.map((prompt, index) => (
        <div
          key={prompt.id}
          className="flex min-h-12 items-center gap-3 rounded-[18px] border border-border bg-background/92 px-3 py-2 shadow-sm backdrop-blur-xl"
          data-queued-prompt-id={prompt.id}
        >
          <ListEndIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-foreground">{prompt.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {index === 0 ? "Sends when the current turn finishes" : `Queued #${index + 1}`}
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => onSteer(prompt.id)}
                  aria-label={`Steer now with: ${prompt.label}`}
                />
              }
            >
              <CornerDownRightIcon className="size-3.5" />
              Steer
            </TooltipTrigger>
            <TooltipPopup side="top">Send this message to the running turn now</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(prompt.id)}
                  aria-label={`Remove queued message: ${prompt.label}`}
                />
              }
            >
              <Trash2Icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="top">Remove from queue</TooltipPopup>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
