// app/components/CookingMode.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { RecipeStep } from "../lib/steps";

interface TimerState {
  remaining: number;
  running: boolean;
  finished: boolean;
}

const ACCENT = "#E8674A";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CookingMode({
  steps,
  mealName,
  onClose,
}: {
  steps: RecipeStep[];
  mealName: string;
  onClose: () => void;
}) {
  const [panes, setPanes] = useState<number[]>([0]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  const [timers, setTimers] = useState<Record<number, TimerState>>(() => {
    const initial: Record<number, TimerState> = {};
    steps.forEach((s, i) => {
      if (s.timer_seconds !== null) {
        initial[i] = { remaining: s.timer_seconds, running: false, finished: false };
      }
    });
    return initial;
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key in next) {
          const t = next[key];
          if (t.running && t.remaining > 0) {
            const remaining = t.remaining - 1;
            next[key] = { remaining, running: remaining > 0, finished: remaining === 0 };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startOrResume(stepIndex: number) {
    setTimers((prev) => ({ ...prev, [stepIndex]: { ...prev[stepIndex], running: true, finished: false } }));
  }
  function pause(stepIndex: number) {
    setTimers((prev) => ({ ...prev, [stepIndex]: { ...prev[stepIndex], running: false } }));
  }
  function resetTimer(stepIndex: number) {
    const seconds = steps[stepIndex].timer_seconds;
    if (seconds === null) return;
    setTimers((prev) => ({ ...prev, [stepIndex]: { remaining: seconds, running: false, finished: false } }));
  }

  function nextAvailable(from: number, excludeIndex?: number): number {
    for (let i = from + 1; i < steps.length; i++) {
      if (completed.has(i)) continue;
      if (excludeIndex !== undefined && panes[excludeIndex] === i) continue;
      return i;
    }
    return steps.length;
  }

  function goBack(paneIdx: number) {
    const current = panes[paneIdx];
    if (current === 0) return;
    setPanes((prev) => prev.map((p, i) => (i === paneIdx ? current - 1 : p)));
  }

  function nextAndClose(paneIdx: number) {
    const current = panes[paneIdx];
    setCompleted((prev) => new Set(prev).add(current));

    const otherPaneIdx = paneIdx === 0 ? 1 : 0;
    const next = nextAvailable(current, panes.length === 2 ? otherPaneIdx : undefined);

    if (next >= steps.length) {
      if (panes.length === 1) onClose();
      else setPanes((prev) => prev.filter((_, i) => i !== paneIdx));
      return;
    }

    if (panes.length === 2) {
      setPanes((prev) => prev.map((p, i) => (i === paneIdx ? next : p)));
    } else {
      setPanes([next]);
    }
  }

  function nextAndKeepOpen(paneIdx: number) {
    if (panes.length >= 2) return;
    const current = panes[paneIdx];
    const next = nextAvailable(current);
    if (next >= steps.length) return;
    setPanes((prev) => [...prev, next].sort((a, b) => a - b));
  }

  function closePane(paneIdx: number) {
    const current = panes[paneIdx];
    setCompleted((prev) => new Set(prev).add(current));

    if (panes.length === 1) {
      onClose();
      return;
    }
    setPanes((prev) => prev.filter((_, i) => i !== paneIdx));
  }

  const split = panes.length === 2;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-[#1A1A1A]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40">{mealName}</p>
          <p className="text-sm font-semibold text-[#1A1A1A]/70">
            {split ? `Steps ${panes[0] + 1} & ${panes[1] + 1}` : `Step ${panes[0] + 1}`} of {steps.length}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-sm font-semibold text-[#1A1A1A]/50 hover:text-[#1A1A1A]"
        >
          ✕ Exit
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 px-6">
        {steps.map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: completed.has(i) || panes.includes(i) ? ACCENT : "#1A1A1A15" }}
          />
        ))}
      </div>

      {/* Panes */}
      <div className="flex flex-1 flex-row overflow-hidden">
        {panes.map((stepIndex, paneIdx) => {
          const step = steps[stepIndex];
          const timer = timers[stepIndex];
          const otherPaneIdx = paneIdx === 0 ? 1 : 0;
          const willFinish = nextAvailable(stepIndex, split ? otherPaneIdx : undefined) >= steps.length;
          const canKeepOpen = !split && nextAvailable(stepIndex) < steps.length;

          return (
            <div
              key={paneIdx}
              className={`flex flex-1 flex-col items-center justify-between overflow-y-auto px-5 py-5 text-center ${
                split && paneIdx === 0 ? "border-r border-[#1A1A1A]/8" : ""
              }`}
            >
              <div className="flex w-full flex-col items-center">
                {split && (
                  <button
                    onClick={() => closePane(paneIdx)}
                    className="mb-3 self-end text-xs font-semibold text-[#1A1A1A]/40 hover:text-[#1A1A1A]"
                  >
                    Close ✕
                  </button>
                )}

                <h1 className={`mb-3 max-w-md font-bold leading-tight ${split ? "text-xl md:text-2xl" : "text-3xl md:text-4xl"}`}>
                  {step.title}
                </h1>
                <p className={`mb-6 max-w-md text-[#1A1A1A]/60 ${split ? "text-sm md:text-base" : "text-lg md:text-xl"}`}>
                  {step.content}
                </p>

                {step.timer_seconds !== null && timer && (
                  <div className="mb-6 flex flex-col items-center">
                    <div
                      className={`mb-3 font-bold tabular-nums ${split ? "text-4xl md:text-5xl" : "text-7xl md:text-8xl"}`}
                      style={{ color: timer.finished ? ACCENT : "#1A1A1A" }}
                    >
                      {formatTime(timer.remaining)}
                    </div>
                    {timer.finished && (
                      <p className="mb-2 text-sm font-bold" style={{ color: ACCENT }}>Time's up! ⏰</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => (timer.running ? pause(stepIndex) : startOrResume(stepIndex))}
                        disabled={timer.remaining === 0}
                        className="rounded-full px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                        style={{ backgroundColor: ACCENT }}
                      >
                        {timer.running ? "Pause" : timer.remaining === step.timer_seconds ? "Start" : "Resume"}
                      </button>
                      <button
                        onClick={() => resetTimer(stepIndex)}
                        className="rounded-full border border-[#1A1A1A]/15 px-5 py-2.5 text-sm font-semibold text-[#1A1A1A]/70 hover:border-[#1A1A1A]/30"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex w-full max-w-xs flex-col gap-2">
                <button
                  onClick={() => goBack(paneIdx)}
                  disabled={stepIndex === 0}
                  className="w-full rounded-full border border-[#1A1A1A]/15 px-4 py-2.5 text-sm font-bold text-[#1A1A1A] transition-colors hover:border-[#1A1A1A]/30 disabled:opacity-30"
                >
                  ← Back
                </button>
                <button
                  onClick={() => nextAndClose(paneIdx)}
                  className="w-full rounded-full px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  {willFinish ? "Finish 🎉" : "Next → (close this)"}
                </button>
                <button
                  onClick={() => nextAndKeepOpen(paneIdx)}
                  disabled={split || !canKeepOpen}
                  className="w-full text-xs font-semibold text-[#1A1A1A]/40 hover:text-[#1A1A1A] disabled:opacity-30"
                >
                  {split ? "Already showing 2 steps" : "Next → (keep this open too)"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
