"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({
  children,
  className,
  busy = false,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  busy?: boolean;
  showClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay" />
      <DialogPrimitive.Content
        className={cn("dialog-content", className)}
        onEscapeKeyDown={(event) => {
          const target = event.target;
          const suggestionOpen =
            target instanceof HTMLInputElement &&
            target.getAttribute("role") === "combobox" &&
            target.getAttribute("aria-expanded") === "true";
          if (busy || suggestionOpen) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="dialog-close button button-ghost button-icon"
            aria-label="Close dialog"
            disabled={busy}
          >
            <X size={20} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
