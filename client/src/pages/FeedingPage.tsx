import { useState, useEffect, useRef, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChild } from "@/contexts/ChildContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Trash2, Clock, Milk, Baby } from "lucide-react";
import { format } from "date-fns";

type ActiveSide = "left" | "right" | null;

interface TimerState {
  side: ActiveSide;
  startMs: number | null;
  leftStart: number | null;
  leftEnd: number | null;
  rightStart: number | null;
  rightEnd: number | null;
  elapsed: number; // ms of current active side
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function FeedingPage() {
  const { t } = useLanguage();
  const { child } = useChild();
  const utils = trpc.useUtils();

  const [timer, setTimer] = useState<TimerState>({
    side: null,
    startMs: null,
    leftStart: null,
    leftEnd: null,
    rightStart: null,
    rightEnd: null,
    elapsed: 0,
  });
  const [bottleMl, setBottleMl] = useState("");
  const [notes, setNotes] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick timer
  useEffect(() => {
    if (timer.side && timer.startMs) {
      intervalRef.current = setInterval(() => {
        setTimer(prev => ({
          ...prev,
          elapsed: prev.startMs ? Date.now() - prev.startMs : 0,
        }));
      }, 500);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer.side, timer.startMs]);

  const startSide = useCallback((side: "left" | "right") => {
    const now = Date.now();
    setTimer(prev => {
      // If switching sides, end the current side first
      const updated = { ...prev };
      if (prev.side === "left" && prev.startMs) {
        updated.leftEnd = now;
      } else if (prev.side === "right" && prev.startMs) {
        updated.rightEnd = now;
      }
      // Start new side
      if (side === "left") {
        updated.leftStart = updated.leftStart ?? now;
        updated.leftEnd = null;
      } else {
        updated.rightStart = updated.rightStart ?? now;
        updated.rightEnd = null;
      }
      updated.side = side;
      updated.startMs = now;
      updated.elapsed = 0;
      return updated;
    });
  }, []);

  const stopTimer = useCallback(() => {
    const now = Date.now();
    setTimer(prev => {
      const updated = { ...prev };
      if (prev.side === "left" && prev.startMs) updated.leftEnd = now;
      else if (prev.side === "right" && prev.startMs) updated.rightEnd = now;
      updated.side = null;
      updated.startMs = null;
      updated.elapsed = 0;
      return updated;
    });
  }, []);

  const resetTimer = useCallback(() => {
    setTimer({ side: null, startMs: null, leftStart: null, leftEnd: null, rightStart: null, rightEnd: null, elapsed: 0 });
    setBottleMl("");
    setNotes("");
  }, []);

  const saveMutation = trpc.feeding.save.useMutation({
    onSuccess: () => {
      toast.success(t("sessionSaved"));
      resetTimer();
      utils.feeding.recent.invalidate({ child });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.feeding.delete.useMutation({
    onSuccess: () => utils.feeding.recent.invalidate({ child }),
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    const now = Date.now();
    // Auto-stop if still running
    let ls = timer.leftStart, le = timer.leftEnd, rs = timer.rightStart, re = timer.rightEnd;
    if (timer.side === "left" && timer.startMs) le = now;
    if (timer.side === "right" && timer.startMs) re = now;

    const hasFeed = ls || rs || bottleMl;
    if (!hasFeed) {
      toast.error("Please record at least one feeding.");
      return;
    }

    saveMutation.mutate({
      child,
      leftStart: ls ?? null,
      leftEnd: le ?? null,
      rightStart: rs ?? null,
      rightEnd: re ?? null,
      bottleMl: bottleMl ? parseInt(bottleMl) : null,
      notes: notes || undefined,
      createdAt: now,
    });
  };

  const { data: recent, isLoading } = trpc.feeding.recent.useQuery({ child, limit: 15 });

  const leftDuration = timer.leftStart
    ? (timer.leftEnd ?? (timer.side === "left" ? Date.now() : timer.leftStart)) - timer.leftStart
    : 0;
  const rightDuration = timer.rightStart
    ? (timer.rightEnd ?? (timer.side === "right" ? Date.now() : timer.rightStart)) - timer.rightStart
    : 0;

  const hasSession = timer.leftStart || timer.rightStart || bottleMl;

  return (
    <div className="container py-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Baby size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("feedingTitle")}</h1>
        <span className={cn(
          "ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold",
          child === "nica" ? "child-pill-nica active" : "child-pill-nici active"
        )}>
          {t(child)}
        </span>
      </div>

      {/* Timer Card */}
      <Card className="shadow-sm border-border">
        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Breast buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Left breast */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground text-center">{t("leftBreast")}</p>
              <button
                onClick={() => timer.side === "left" ? stopTimer() : startSide("left")}
                className={cn(
                  "w-full py-4 rounded-xl font-bold text-sm transition-all border-2",
                  timer.side === "left"
                    ? "bg-primary text-primary-foreground border-primary timer-active"
                    : timer.leftStart
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-secondary text-secondary-foreground border-transparent hover:border-primary/30"
                )}
              >
                <div className="timer-display text-xl font-mono">
                  {timer.side === "left"
                    ? formatDuration(timer.elapsed)
                    : formatDuration(leftDuration)}
                </div>
                <div className="text-xs mt-0.5 opacity-70">
                  {timer.side === "left" ? t("stopTimer") : timer.leftStart ? "✓" : t("startTimer")}
                </div>
              </button>
            </div>

            {/* Right breast */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground text-center">{t("rightBreast")}</p>
              <button
                onClick={() => timer.side === "right" ? stopTimer() : startSide("right")}
                className={cn(
                  "w-full py-4 rounded-xl font-bold text-sm transition-all border-2",
                  timer.side === "right"
                    ? "bg-primary text-primary-foreground border-primary timer-active"
                    : timer.rightStart
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-secondary text-secondary-foreground border-transparent hover:border-primary/30"
                )}
              >
                <div className="timer-display text-xl font-mono">
                  {timer.side === "right"
                    ? formatDuration(timer.elapsed)
                    : formatDuration(rightDuration)}
                </div>
                <div className="text-xs mt-0.5 opacity-70">
                  {timer.side === "right" ? t("stopTimer") : timer.rightStart ? "✓" : t("startTimer")}
                </div>
              </button>
            </div>
          </div>

          {/* Switch side shortcut */}
          {timer.side && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => startSide(timer.side === "left" ? "right" : "left")}
            >
              ⇄ {t("switchSide")}
            </Button>
          )}

          {/* Bottle feeding */}
          <div className="flex items-center gap-2">
            <Milk size={16} className="text-muted-foreground shrink-0" />
            <Input
              type="number"
              placeholder={t("bottleMl")}
              value={bottleMl}
              onChange={e => setBottleMl(e.target.value)}
              className="flex-1"
              min={0}
              max={500}
            />
            <span className="text-xs text-muted-foreground">ml</span>
          </div>

          {/* Notes */}
          <Input
            placeholder={t("notes")}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {/* Save / Reset */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!hasSession || saveMutation.isPending}
            >
              {saveMutation.isPending ? t("loading") : t("saveSession")}
            </Button>
            {hasSession && (
              <Button variant="outline" onClick={resetTimer}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">{t("history")}</h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("loading")}</p>
        ) : !recent || recent.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("noFeedings")}</p>
        ) : (
          <div className="space-y-2">
            {recent.map(session => {
              const leftMs = session.leftStart && session.leftEnd ? session.leftEnd - session.leftStart : 0;
              const rightMs = session.rightStart && session.rightEnd ? session.rightEnd - session.rightStart : 0;
              const timeStr = format(new Date(session.createdAt), "HH:mm");
              const dateStr = format(new Date(session.createdAt), "dd.MM");
              return (
                <Card key={session.id} className="shadow-sm">
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{dateStr} {t("at")} {timeStr}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {leftMs > 0 && (
                            <span>◀ {formatMs(leftMs)}</span>
                          )}
                          {rightMs > 0 && (
                            <span>▶ {formatMs(rightMs)}</span>
                          )}
                          {session.bottleMl && (
                            <span>🍼 {session.bottleMl}ml</span>
                          )}
                        </div>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground italic">{session.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteMutation.mutate({ id: session.id })}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
