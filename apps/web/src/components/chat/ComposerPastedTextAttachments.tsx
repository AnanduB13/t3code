import { FileTextIcon, XIcon } from "lucide-react";
import { useState } from "react";

import type { ComposerPastedTextAttachment } from "~/composerDraftStore";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

interface ComposerPastedTextAttachmentsProps {
  pastedTexts: ReadonlyArray<ComposerPastedTextAttachment>;
  onRemove?: (id: string) => void;
  className?: string;
}

export function ComposerPastedTextAttachments({
  pastedTexts,
  onRemove,
  className,
}: ComposerPastedTextAttachmentsProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = pastedTexts.findIndex((item) => item.id === openId);
  const openItem = openIndex >= 0 ? pastedTexts[openIndex] : null;

  if (pastedTexts.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {pastedTexts.map((item, index) => {
          const label = `Pasted text #${index + 1}`;
          return (
            <div
              key={item.id}
              className={cn(
                "group/paste relative flex h-16 min-w-40 max-w-56 items-center gap-2.5 rounded-lg border border-border/80 bg-background px-3",
                onRemove && "pr-9",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                aria-label={`View ${label}`}
                onClick={() => setOpenId(item.id)}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FileTextIcon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.text.length.toLocaleString()} characters
                  </span>
                </span>
              </button>
              {onRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="absolute right-1 top-1 bg-background/80 hover:bg-background/90"
                  aria-label={`Remove ${label}`}
                  onClick={() => onRemove(item.id)}
                >
                  <XIcon />
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Dialog open={openItem !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogPopup className="max-w-3xl" bottomStickOnMobile={false}>
          <DialogHeader>
            <DialogTitle>Pasted text #{openIndex + 1}</DialogTitle>
            <DialogDescription>
              {openItem?.text.length.toLocaleString() ?? 0} characters
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="pt-0">
            <pre className="whitespace-pre-wrap wrap-break-word font-mono text-sm leading-relaxed text-foreground">
              {openItem?.text}
            </pre>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}
