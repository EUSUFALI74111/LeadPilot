import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "size-12" : size === "sm" ? "size-8" : "size-10";
  const icon = size === "lg" ? "size-6" : size === "sm" ? "size-4" : "size-5";
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm",
        dims,
        className,
      )}
    >
      <Send className={icon} strokeWidth={2.2} />
    </div>
  );
}

export function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Logo />
      <div className="leading-tight">
        <p className="text-base font-semibold tracking-tight">LeadPilot</p>
        <p className="text-xs text-muted-foreground">{subtitle ?? "Lead & Email Suite"}</p>
      </div>
    </div>
  );
}
