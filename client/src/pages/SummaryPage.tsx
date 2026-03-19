import { useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { cn } from "@/lib/utils";

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

interface ChildSummaryProps {
  child: "nica" | "nici";
  dayStartMs: number;
  dayEndMs: number;
}

function ChildSummary({ child, dayStartMs, dayEndMs }: ChildSummaryProps) {
  const { t } = useLanguage();

  const { data: feedings, isLoading: feedLoading } = trpc.feeding.forDay.useQuery(
    { child, dayStartMs, dayEndMs },
    { staleTime: 30_000 }
  );

  const { data: diapers, isLoading: diaperLoading } = trpc.diaper.forDay.useQuery(
    { child, dayStartMs, dayEndMs },
    { staleTime: 30_000 }
  );

  const feedStats = useMemo(() => {
    if (!feedings) return { totalMs: 0, count: 0, lastFeedTime: null as number | null, bottleCount: 0 };
    let totalMs = 0;
    let lastFeedTime: number | null = null;
    let bottleCount = 0;
    for (const s of feedings) {
      if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
      if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
      if (s.bottleMl) bottleCount++;
      if (!lastFeedTime || s.createdAt > lastFeedTime) lastFeedTime = s.createdAt;
    }
    return { totalMs, count: feedings.length, lastFeedTime, bottleCount };
  }, [feedings]);

  const diaperStats = useMemo(() => {
    if (!diapers) return { total: 0, wet: 0, dirty: 0, both: 0 };
    return {
      total: diapers.length,
      wet: diapers.filter(d => d.type === "wet").length,
      dirty: diapers.filter(d => d.type === "dirty").length,
      both: diapers.filter(d => d.type === "both").length,
    };
  }, [diapers]);

  const isLoading = feedLoading || diaperLoading;

  return (
    <Card className={cn("shadow-sm", child === "nica" ? "border-l-4 border-l-[oklch(0.75_0.15_340)]" : "border-l-4 border-l-[oklch(0.7_0.15_200)]")}>
      <CardContent className="pt-3 pb-3">
        {/* Child name */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-xs font-bold",
            child === "nica" ? "child-pill-nica active" : "child-pill-nici active"
          )}>
            {t(child)}
          </span>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="space-y-3">
            {/* Feeding stats */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">🤱 {t("feedingTitle")}</p>
              <div className="grid grid-cols-3 gap-2">
                <StatBox label={t("feedingsCount")} value={String(feedStats.count)} />
                <StatBox label={t("totalFeedingTime")} value={feedStats.totalMs > 0 ? formatMs(feedStats.totalMs) : "—"} />
                <StatBox
                  label={t("lastFeeding")}
                  value={feedStats.lastFeedTime ? format(new Date(feedStats.lastFeedTime), "HH:mm") : "—"}
                />
              </div>
              {feedStats.bottleCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">🍼 {feedStats.bottleCount} {t("bottle")}</p>
              )}
            </div>

            {/* Diaper stats */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">💧 {t("diaperTitle")}</p>
              <div className="grid grid-cols-4 gap-2">
                <StatBox label={t("diaperChanges")} value={String(diaperStats.total)} />
                <StatBox label="💧" value={String(diaperStats.wet)} />
                <StatBox label="💩" value={String(diaperStats.dirty)} />
                <StatBox label="🔄" value={String(diaperStats.both)} />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted rounded-lg px-2 py-2 text-center">
      <p className="text-base font-bold text-foreground leading-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
    </div>
  );
}

export default function SummaryPage() {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);
  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  const dayStartMs = useMemo(() => dayStart.getTime(), [dayStart.getTime()]);
  const dayEndMs = useMemo(() => dayEnd.getTime(), [dayEnd.getTime()]);

  return (
    <div className="container py-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <BarChart2 size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("summaryTitle")}</h1>
      </div>

      {/* Date navigator */}
      <div className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setSelectedDate(d => subDays(d, 1))}
        >
          <ChevronLeft size={18} />
        </Button>

        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">
            {isToday ? t("today") : format(selectedDate, "EEEE")}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(selectedDate, "dd.MM.yyyy")}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setSelectedDate(d => addDays(d, 1))}
          disabled={isToday}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {/* Both children summaries */}
      <ChildSummary child="nica" dayStartMs={dayStartMs} dayEndMs={dayEndMs} />
      <ChildSummary child="nici" dayStartMs={dayStartMs} dayEndMs={dayEndMs} />
    </div>
  );
}
