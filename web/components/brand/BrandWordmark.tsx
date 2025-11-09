import { cn } from "@/lib/utils";

export function BrandWordmark({
  className,
  flowClassName,
  forgeClassName,
}: {
  className?: string;
  flowClassName?: string;
  forgeClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline leading-none", className)}>
      <span className={cn("text-[var(--primary)]", flowClassName)}>Flow</span>
      <span className={forgeClassName}>Forge</span>
    </span>
  );
}
