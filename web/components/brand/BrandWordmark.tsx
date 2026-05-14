import { cn } from "@/lib/utils";

export function BrandWordmark({
  className,
  iconClassName,
  flowClassName,
  forgeClassName,
}: {
  className?: string;
  iconClassName?: string;
  flowClassName?: string;
  forgeClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 leading-none", className)}>
      <img
        src="/images/flowforge.png"
        alt=""
        aria-hidden="true"
        className={cn("size-6 shrink-0 rounded-[7px]", iconClassName)}
      />
      <span className="inline-flex items-baseline">
        <span className={cn("text-[var(--primary)]", flowClassName)}>Floow</span>
        <span className={forgeClassName}>Forge</span>
      </span>
    </span>
  );
}
