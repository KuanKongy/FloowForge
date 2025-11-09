"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "./button";


function buildConfirmDialogHandleSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterConfirmDialogHandleRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildConfirmDialogHandleSearchText(record).includes(needle));
}

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
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onCancel}
    >
      <div
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
              <div className="text-sm text-[var(--muted-foreground)] mt-1">{description}</div>
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

function moveConfirmDialogResultItem<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex < 0) return items;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
  return next;
}

function removeConfirmDialogResultItem<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

