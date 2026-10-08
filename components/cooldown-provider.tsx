"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playCooldownNotificationSound } from "@/lib/client/cooldown-audio";

const STORAGE_KEY = "forgeai-provider-cooldown";

type Cooldown = {
  id: string;
  until: number;
  notified: boolean;
  dismissed: boolean;
};

type RegisterCooldown = (
  error: string | null,
  occurredAt: Date | string | null,
  scope: string,
) => void;

const CooldownContext = createContext<RegisterCooldown>(() => undefined);

function parseCooldownMs(error: string): number | null {
  if (!/cooldown|rate.?limit|429|held back|limit allows|try again|retry/i.test(error)) return null;

  const durationMatch = /\b(?:in|after)\s+(?:about\s+)?((?:(?:\d+(?:\.\d+)?)\s*(?:milliseconds?|ms|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+)/i.exec(error);
  if (!durationMatch) return null;

  let totalMs = 0;
  for (const [, amountText, unitText] of durationMatch[1].matchAll(/(\d+(?:\.\d+)?)\s*(milliseconds?|ms|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi)) {
    const amount = Number(amountText);
    const unit = unitText.toLowerCase();
    if (unit.startsWith("ms") || unit.startsWith("millisecond")) totalMs += amount;
    else if (unit.startsWith("h")) totalMs += amount * 60 * 60 * 1000;
    else if (unit.startsWith("m")) totalMs += amount * 60 * 1000;
    else totalMs += amount * 1000;
  }

  return totalMs > 0 ? Math.ceil(totalMs) : null;
}

function readStoredCooldown(): Cooldown | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<Cooldown>;
    if (typeof parsed.id !== "string" || typeof parsed.until !== "number") return null;
    if (parsed.until + 24 * 60 * 60 * 1000 < Date.now()) return null;

    // Don't play a delayed sound after someone has closed or reloaded the app.
    return {
      id: parsed.id,
      until: parsed.until,
      notified: parsed.notified === true || parsed.until <= Date.now(),
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return null;
  }
}

function storeCooldown(cooldown: Cooldown) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cooldown));
  } catch {
    // The timer still works for this page view if storage is unavailable.
  }
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
  }
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

export function CooldownProvider({ children }: { children: ReactNode }) {
  const [cooldown, setCooldown] = useState<Cooldown | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const soundedIds = useRef(new Set<string>());
  const cooldownRef = useRef<Cooldown | null>(null);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      if (cooldownRef.current) return;
      const stored = readStoredCooldown();
      if (stored) {
        cooldownRef.current = stored;
        storeCooldown(stored);
        setCooldown(stored);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!cooldown || cooldown.notified) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);

      if (currentTime >= cooldown.until) {
        if (!soundedIds.current.has(cooldown.id)) {
          soundedIds.current.add(cooldown.id);
          playCooldownNotificationSound();
        }

        const completed = { ...cooldown, notified: true };
        cooldownRef.current = completed;
        storeCooldown(completed);
        setCooldown(completed);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const registerCooldown = useCallback<RegisterCooldown>((error, occurredAt, scope) => {
    if (!error) return;
    const durationMs = parseCooldownMs(error);
    if (!durationMs) return;

    const occurredAtMs = occurredAt instanceof Date
      ? occurredAt.getTime()
      : occurredAt
        ? Date.parse(occurredAt)
        : Date.now();
    const start = Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now();
    const next: Cooldown = {
      id: `${scope}:${start}:${durationMs}`,
      until: start + durationMs,
      notified: start + durationMs <= Date.now(),
      dismissed: false,
    };

    const current = cooldownRef.current;
    if (current?.id === next.id) return;
    if (current && current.until > Date.now() && current.until >= next.until) return;

    cooldownRef.current = next;
    storeCooldown(next);
    setCooldown(next);
    setNow(Date.now());
  }, []);

  const remainingMs = cooldown ? Math.max(0, cooldown.until - now) : 0;
  const isVisible = cooldown !== null && !cooldown.dismissed;

  return (
    <CooldownContext.Provider value={registerCooldown}>
      {children}
      {isVisible && cooldown && (
        <aside className="fixed bottom-4 right-4 z-[100] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-card/95 p-4 text-card-foreground shadow-xl backdrop-blur-md" aria-label="Provider cooldown" aria-live="off">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              {remainingMs > 0 ? <Bell aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{remainingMs > 0 ? "Provider cooldown" : "Cooldown complete"}</p>
              {remainingMs > 0 ? (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">You can try the AI request again in</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-primary">{formatRemaining(remainingMs)}</p>
                </>
              ) : (
                <p role="status" aria-live="polite" className="mt-1 text-sm text-muted-foreground">The provider is available again. You can retry now.</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss cooldown notice"
              onClick={() => {
                const dismissed = { ...cooldown, dismissed: true };
                cooldownRef.current = dismissed;
                storeCooldown(dismissed);
                setCooldown(dismissed);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </aside>
      )}
    </CooldownContext.Provider>
  );
}

export function CooldownRegistration({
  error,
  occurredAt,
  scope,
}: {
  error: string | null;
  occurredAt: Date | string | null;
  scope: string;
}) {
  const registerCooldown = useContext(CooldownContext);

  useEffect(() => {
    registerCooldown(error, occurredAt, scope);
  }, [error, occurredAt, registerCooldown, scope]);

  return null;
}
