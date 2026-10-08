"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";

const stages = ["Analysis", "Plan", "Code changes", "Verification", "Pull request"];
const currentStep: Record<string, number> = {
  analyzing: 0, analysis_completed: 1, planning: 1, plan_completed: 1,
  plan_approved: 2, generating: 2, changes_generated: 3, verifying: 3,
  repairing: 3, changes_approved: 4, changes_rejected: 3, failed: 0,
};
const doneThrough: Record<string, number> = {
  analysis_completed: 0, planning: 0, plan_completed: 0, plan_approved: 1,
  generating: 1, changes_generated: 2, verifying: 2, repairing: 2,
  changes_approved: 3, changes_rejected: 2,
};
const running = new Set(["analyzing", "planning", "generating", "verifying", "repairing"]);
const titles: Record<string, string> = {
  analyzing: "Analyzing the requirement", analysis_completed: "Analysis is ready",
  planning: "Creating the implementation plan", plan_completed: "Plan ready for review",
  plan_approved: "Plan approved", generating: "Generating code changes",
  changes_generated: "Draft changes are ready", verifying: "Verifying the changes",
  repairing: "Repairing failed checks", changes_approved: "Changes approved",
  changes_rejected: "Changes rejected", failed: "Workflow stopped",
};
const details: Record<string, string> = {
  analyzing: "Reviewing the request alongside the authorized repository context.",
  analysis_completed: "Review the analysis and create an implementation plan when ready.",
  planning: "Organizing the work into tasks grounded in the repository.",
  plan_completed: "Approve the plan to unlock code generation, or request changes first.",
  plan_approved: "Generate a draft from the approved plan when you are ready.",
  generating: "Preparing a draft. No repository files have been changed.",
  changes_generated: "Review the draft and run the repository checks before deciding.",
  verifying: "Running the repository scripts in an isolated Docker container.",
  repairing: "Applying a repair attempt and preparing a follow-up verification.",
  changes_approved: "The approved draft is ready for pull request creation.",
  changes_rejected: "Review the decision and feedback below.",
  failed: "Review the error below. No analysis result was saved.",
};

function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function WorkflowProgress({
  status, startedAt, pullRequestStatus, pullRequestNumber, watchFrom,
}: {
  status: string; startedAt: string; pullRequestStatus?: string; pullRequestNumber?: number | null; watchFrom?: string;
}) {
  const router = useRouter();
  const illustrationRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [illustrationActive, setIllustrationActive] = useState(false);
  const creating = status === "changes_approved" && pullRequestStatus === "creating";
  const active = running.has(status) || creating;
  const watchingStart = Boolean(watchFrom && status === watchFrom);
  const index = currentStep[status] ?? 0;
  const complete = status === "changes_approved" && pullRequestStatus === "created" ? 4 : doneThrough[status] ?? -1;
  const failed = ["failed", "changes_rejected"].includes(status) || pullRequestStatus === "failed";
  const title = creating ? "Creating the pull request" :
    pullRequestStatus === "created" ? `Pull request${pullRequestNumber ? ` #${pullRequestNumber}` : ""} created` :
    pullRequestStatus === "failed" ? "Pull request creation failed" : status === "cancelled" ? "Workflow cancelled" : titles[status] ?? "Workflow in progress";

  useEffect(() => {
    if (!active && !watchingStart) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    const refresh = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000);
    return () => { window.clearInterval(timer); window.clearInterval(refresh); };
  }, [active, router, startedAt, watchingStart]);

  useEffect(() => {
    const element = illustrationRef.current;
    if (!element || !active) {
      setIllustrationActive(false);
      return;
    }

    let inViewport = false;
    const updateMotion = () => {
      setIllustrationActive(inViewport && document.visibilityState === "visible");
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      updateMotion();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", updateMotion);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateMotion);
    };
  }, [active]);

  return (
    <section aria-label="Workflow progress" className={`progress-panel ${failed ? "progress-panel-failed" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Progress</p>
        {active && <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-primary"><LoaderCircle className="size-4 motion-safe:animate-spin" /> Working · updates every 5 seconds</span>}
      </div>
      <ol className="progress-steps" aria-label="Workflow stages">
        {stages.map((stage, i) => {
          const current = i === index;
          const done = i <= complete;
          return <li key={stage} aria-current={current ? "step" : undefined} className={current ? "is-current" : done ? "is-done" : ""}>
            <span className="progress-step-icon" aria-hidden="true">{done && !current ? <Check className="size-4" /> : current && active ? <LoaderCircle className="size-4 motion-safe:animate-spin" /> : String(i + 1).padStart(2, "0")}</span>
            <span>{stage}</span>
          </li>;
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-6 border-t pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-base leading-7 text-muted-foreground">{creating ? "Publishing approved changes to GitHub. The pull request will not be merged." : pullRequestStatus === "created" ? "The pull request is ready on GitHub and has not been merged." : status === "cancelled" ? "The run was stopped. Any completed analysis, plan or draft remains available." : details[status] ?? "The workflow is being updated."}</p>
        </div>
        {active && <p className="font-mono text-sm tabular-nums text-muted-foreground" role="timer" aria-live="off">{elapsedLabel(seconds)} elapsed</p>}
        <div ref={illustrationRef} className={`workflow-art hidden w-44 shrink-0 sm:block ${active && illustrationActive ? "is-active" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 220 136" className="relative z-10 h-auto w-full" fill="none">
            <rect x="27" y="15" width="166" height="106" rx="8" fill="var(--card)" stroke="var(--border)" />
            <path d="M27 38h166" stroke="var(--border)" />
            <circle cx="42" cy="27" r="3" fill="var(--workflow-art-dot-red)" />
            <circle cx="53" cy="27" r="3" fill="var(--workflow-art-dot-yellow)" />
            <circle cx="64" cy="27" r="3" fill="var(--workflow-art-dot-green)" />
            <rect x="43" y="51" width="34" height="6" rx="3" fill="var(--workflow-art-row-blue)" />
            <rect x="82" y="51" width="72" height="6" rx="3" fill="var(--workflow-art-row-neutral)" />
            <rect x="43" y="67" width="18" height="6" rx="3" fill="var(--workflow-art-row-pink)" />
            <rect x="67" y="67" width="102" height="6" rx="3" fill="var(--workflow-art-row-neutral)" />
            <rect x="43" y="83" width="27" height="6" rx="3" fill="var(--workflow-art-row-green)" />
            <path className="workflow-art-signal" d="M76 86h79" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
            <rect x="43" y="99" width="48" height="6" rx="3" fill="var(--workflow-art-row-green)" />
            <rect x="97" y="99" width="52" height="6" rx="3" fill="var(--workflow-art-row-neutral)" />
            <circle className="workflow-art-cursor" cx="174" cy="102" r="5" fill="var(--workflow-art-cursor)" />
          </svg>
        </div>
      </div>
      {active && seconds >= 60 && <p role="status" className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm leading-6">{seconds >= 900 ? "No new status has been recorded for 15 minutes. The request may still be waiting on external work; automatic checks continue." : "This is taking longer than usual. The workflow remains in progress and automatic checks continue."}</p>}
    </section>
  );
}
