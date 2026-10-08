"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unlockCooldownNotificationSound } from "@/lib/client/cooldown-audio";

type AsyncSubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  pendingMessage: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "xs" | "lg" | "icon" | "icon-sm" | "icon-xs" | "icon-lg";
  className?: string;
  disabled?: boolean;
};

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function AsyncSubmitButton({
  children,
  pendingLabel,
  pendingMessage,
  variant,
  size,
  className,
  disabled = false,
}: AsyncSubmitButtonProps) {
  const { pending } = useFormStatus();
  const router = useRouter();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!pending) {
      startedAt.current = null;
      return;
    }

    startedAt.current ??= Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 1000);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(refresh);
    };
  }, [pending, router]);

  const waitingMessage =
    elapsedSeconds >= 60
      ? "The request has not returned yet. AI provider limits or verification can extend the wait."
      : elapsedSeconds >= 15
        ? "Still waiting for the request to finish. The page will update when it returns."
        : pendingMessage;

  return (
    <div className="space-y-1.5">
      <Button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
        onClick={() => {
          unlockCooldownNotificationSound();
          startedAt.current = Date.now();
          setElapsedSeconds(0);
        }}
        variant={variant}
        size={size}
        className={className}
      >
        {pending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
        {pending ? pendingLabel : children}
      </Button>
      {pending && (
        <p role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{waitingMessage}</span>
          <span className="font-mono tabular-nums" aria-label={`Elapsed ${elapsedLabel(elapsedSeconds)}`}>
            {elapsedLabel(elapsedSeconds)} elapsed
          </span>
        </p>
      )}
    </div>
  );
}
