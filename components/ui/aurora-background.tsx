import { cn } from "@/lib/utils";

type AuroraBackgroundProps = React.HTMLAttributes<HTMLDivElement>;

export function AuroraBackground({ className, ...props }: AuroraBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("aurora-background pointer-events-none absolute inset-0 overflow-hidden", className)}
      {...props}
    >
      <div className="aurora-background__lights absolute -inset-10" />
    </div>
  );
}
