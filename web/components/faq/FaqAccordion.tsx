"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

export type FaqItem = { q: string; a: React.ReactNode };

/**
 * OnboardBuddy-style accordion: one surface panel per section, rows divided by
 * hairlines, a chevron that turns as the row opens. The answer's height is
 * animated with the grid-rows trick (0fr → 1fr), so opening is smooth without
 * any JS measurement; opacity rides along for a softer landing.
 *
 * One row open per panel: opening a question folds the previous one away.
 */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="card-surface overflow-hidden">
      {items.map((item) => {
        const isOpen = open === item.q;
        return (
          <div key={item.q} className="border-t border-[var(--border)] first:border-t-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : item.q)}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm font-medium cursor-pointer transition-colors duration-200 ${
                isOpen ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]"
              }`}
            >
              <ChevronRight
                size={15}
                className={`shrink-0 text-[var(--muted-foreground)] transition-transform duration-300 ${
                  isOpen ? "rotate-90" : ""
                }`}
              />
              {item.q}
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div
                  className={`px-5 pt-3 pb-4 pl-[47px] text-sm text-[var(--muted-foreground)] leading-relaxed transition-opacity duration-300 ${
                    isOpen ? "opacity-100" : "opacity-0"
                  }`}
                >
                  {item.a}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
