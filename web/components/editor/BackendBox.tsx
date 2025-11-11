"use client";

import type { ReactNode } from "react";

export type NodeKind = "text" | "image" | "audio" | "file" | "chat";

/**
 * Floowbox-style backend tile. Full-opacity colored outer pad with a white
 * inner card containing a colored icon and black label text.
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
  return (
    <div
      className={`flex relative text-[0.9rem] p-[0.25em] rounded-[10px] ${className}`}
      style={{
        background: `rgba(var(--${kind}__background-rgb), 1)`,
      }}
    >
      <div
        className="bg-white rounded-[8px] font-medium h-[3em] pl-[0.7em] pr-[1.2em] flex items-center justify-center"
        style={{
          boxShadow: `0 1px 2px 0 rgba(var(--${kind}__font-rgb), 0.5)`,
        }}
      >
        <div
          className="flex items-center gap-x-[0.5em]"
          style={{ color: `rgba(var(--${kind}__font-rgb), 1)` }}
        >
          {icon}
          <span className="text-black font-medium text-sm">{label}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
