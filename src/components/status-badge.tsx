import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success/12 text-success border-success/25",
  info: "bg-info/12 text-info border-info/25",
  warning: "bg-warning/18 text-warning-foreground border-warning/35",
  danger: "bg-destructive/12 text-destructive border-destructive/25",
  primary: "bg-primary/10 text-primary border-primary/25",
};

const map: Record<string, keyof typeof tones> = {
  New: "info",
  Contacted: "primary",
  Qualified: "success",
  "Send failed": "danger",
  Bounced: "danger",
  Unsubscribed: "neutral",
  Draft: "neutral",
  Queued: "info",
  Running: "primary",
  Paused: "warning",
  Completed: "success",
  Failed: "danger",
  Active: "success",
  Connected: "success",
  "Needs test": "warning",
  Testing: "info",
  Warming: "warning",
  Error: "danger",
  Sent: "success",
  Pending: "warning",
  Opened: "info",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = tones[map[status] ?? "neutral"];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
