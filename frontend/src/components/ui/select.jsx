import { cn } from "../../lib/utils.js";

export function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        "flex min-h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
