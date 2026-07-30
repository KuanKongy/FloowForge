"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./button";

/**
 * Lightweight confirm dialog used everywhere the platform asks the user to
 * destroy something (delete flow, trigger, custom node, integration, ...).
 * No portal — it just renders a fixed overlay above the page. Esc closes.
 *
 * Design notes:
 * - The dialog body is pinned to a 480px max card so it never feels
 *   stretched on wide screens.
 * - The destructive action is shown as a red filled button so the user has
 *   to consciously commit to it. Cancel is the default focused button.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Restore focus to whatever opened the dialog once it closes.
    const opener = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      // Trap Tab inside the panel; without this, tabbing walked into the page
      // behind the overlay.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        // role/aria live on the panel, not the click-to-close backdrop.
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="card-surface w-[min(480px,100%)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 pt-5 pb-3 flex items-start gap-3">
          {destructive ? (
            <div className="size-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <h2 id="confirm-dialog-title" className="font-semibold text-base">
              {title}
            </h2>
            {description && (
              <div
                id="confirm-dialog-description"
                className="text-sm text-[var(--muted-foreground)] mt-1"
              >
                {description}
              </div>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Close dialog"
            className="p-1 rounded-md hover:bg-[var(--muted)] transition-colors text-[var(--muted-foreground)]"
          >
            <X size={16} />
          </button>
        </header>
        <footer className="px-5 pb-5 pt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} autoFocus>
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            className={
              destructive
                ? "bg-red-500 text-white hover:bg-red-600 active:bg-red-700"
                : ""
            }
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
