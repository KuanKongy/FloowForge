"use client";

import type { ReactNode } from "react";

export type NodeKind = "text" | "image" | "audio" | "file" | "chat";

/**
 * Floowbox-style backend tile. Renders an outer tinted pad and an inner
 * surface card with a title and an icon. The pad's color is keyed off the
 * `--${kind}__background-rgb` / `--${kind}__font-rgb` design tokens so
 * different I/O types pop visually without bespoke CSS per node.
 *
 * Used by Text, Image, Audio, File, and Chat nodes when the editor is in
 * Backend mode (the toggle on the top bar).
 */
export function BackendBox({
  kind,
  icon,
  label,
  children,
  className = "",
}: {
  kind: NodeKind;
  icon: ReactNode;
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const padBg = `rgba(var(--${kind}__background-rgb), 0.45)`;
  const padBorder = `rgba(var(--${kind}__font-rgb), 0.25)`;
  const accent = `var(--${kind}__font)`;
  return (
    <div
      className={`p-2 rounded-[18px] ${className}`}
      style={{
        background: padBg,
        border: `1px solid ${padBorder}`,
      }}
    >
      <div
        className="bg-[var(--surface-2)] border rounded-[14px] flex items-center gap-3 px-4 py-3"
        style={{ borderColor: "var(--border--container)" }}
      >
        <div
          className="size-9 rounded-[10px] flex items-center justify-center"
          style={{
            background: `rgba(var(--${kind}__background-rgb), 1)`,
            color: accent,
          }}
        >
          {icon}
        </div>
        <span className="font-medium text-sm" style={{ color: accent }}>
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}
