import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-xl bg-surface-container-low p-6", className)}>{children}</div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider",
        tone.bg,
        tone.text,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function statusTone(status: string) {
  if (["ACTIVE", "RESOLVED_NO_BREACH"].includes(status)) {
    return { bg: "bg-secondary/10", text: "text-secondary", dot: "bg-secondary" };
  }
  if (["PROPOSED", "PINNED"].includes(status)) {
    return { bg: "bg-tertiary/10", text: "text-tertiary", dot: "bg-tertiary animate-pulse" };
  }
  if (["RESOLVED_BREACH", "RESOLVED_PARTIAL"].includes(status)) {
    return { bg: "bg-error/10", text: "text-error", dot: "bg-error" };
  }
  if (status === "INCONCLUSIVE") {
    return { bg: "bg-outline/10", text: "text-on-surface-variant", dot: "bg-outline" };
  }
  return { bg: "bg-surface-container-high", text: "text-on-surface-variant", dot: "bg-outline" };
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-on-primary hover:bg-primary-fixed",
        variant === "secondary" &&
          "bg-surface-container-high text-on-surface hover:bg-surface-bright",
        variant === "danger" &&
          "border border-error bg-error/10 text-error hover:bg-error hover:text-on-error",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low py-16 text-center">
      <p className="font-display text-lg text-on-surface">{title}</p>
      <p className="max-w-md text-sm text-on-surface-variant">{description}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-error/40 bg-error/5 py-16 text-center">
      <p className="font-display text-lg text-error">Something went wrong</p>
      <p className="max-w-md text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
    </div>
  );
}
