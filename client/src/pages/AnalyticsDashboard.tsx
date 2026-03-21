import { useState, useMemo } from "react";
import packageJson from "../../../package.json";
import { trpc } from "@/lib/trpc";
import { startOfDay, endOfDay, subDays, format, addDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";
import { ChevronLeft, ChevronRight, Baby, Droplets, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function calcFeedingStats(sessions: FeedingSession[]) {
  let totalMs = 0;
  let lastFeedTime: number | null = null;
  let bottleCount = 0;
  let bottleMlTotal = 0;
  for (const s of sessions) {
    if (s.leftStart && s.leftEnd) totalMs += s.leftEnd - s.leftStart;
    if (s.rightStart && s.rightEnd) totalMs += s.rightEnd - s.rightStart;
    if (s.bottleMl) { bottleCount++; bottleMlTotal += s.bottleMl; }
    if (!lastFeedTime || s.createdAt > lastFeedTime) lastFeedTime = s.createdAt;
  }
  return { totalMs, count: sessions.length, lastFeedTime, bottleCount, bottleMlTotal };
}

type FeedingSession = {
  id: number;
  child: string;
  leftStart: number | null;
  leftEnd: number | null;
  rightStart: number | null;
  rightEnd: number | null;
  bottleMl: number | null;
  notes: string | null;
  createdAt: number;
};

type DiaperChange = {
  id: number;
  child: string;
  type: string;
  changedAt: number;
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className={cn("rounded-2xl p-4 flex items-start gap-3", color)}>
      <div className="mt-0.5 opacity-80">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Child Panel ──────────────────────────────────────────────────────────────

function ChildPanel({
  name, icon, feedings, diapers, color,
}: {
  name: string;
  icon: string;
  feedings: FeedingSession[];
  diapers: DiaperChange[];
  color: string;
}) {
  const stats = calcFeedingStats(feedings);
  const wet = diapers.filter(d => d.type === "wet").length;
  const dirty = diapers.filter(d => d.type === "dirty").length;
  const both = diapers.filter(d => d.type === "both").length;
  const lastStr = stats.lastFeedTime
    ? format(new Date(stats.lastFeedTime), "HH:mm")
    : "—";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold">{name}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Baby size={18} />}
          label="Feedings"
          value={String(stats.count)}
          sub={stats.totalMs > 0 ? formatMs(stats.totalMs) : undefined}
          color={cn("bg-purple-50 text-purple-900 dark:bg-purple-900/20 dark:text-purple-200")}
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Last fed"
          value={lastStr}
          color={cn("bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200")}
        />
        <StatCard
          icon={<Droplets size={18} />}
          label="Diapers"
          value={String(diapers.length)}
          sub={`💧${wet} 💩${dirty} 🔄${both}`}
          color={cn("bg-green-50 text-green-900 dark:bg-green-900/20 dark:text-green-200")}
        />
        {stats.bottleCount > 0 && (
          <StatCard
            icon={<span className="text-base">🍼</span>}
            label="Bottle"
            value={`${stats.bottleCount}×`}
            sub={`${stats.bottleMlTotal} ml`}
            color={cn("bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200")}
          />
        )}
      </div>

      {/* Feeding timeline */}
      {feedings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timeline</p>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {[...feedings].sort((a, b) => b.createdAt - a.createdAt).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-1.5">
                <span className="text-muted-foreground font-mono text-xs w-10 shrink-0">
                  {format(new Date(s.createdAt), "HH:mm")}
                </span>
                <span className="flex gap-1.5 flex-wrap">
                  {s.leftStart && s.leftEnd && (
                    <span className="text-purple-700 dark:text-purple-300">
                      👈 {formatMs(s.leftEnd - s.leftStart)}
                    </span>
                  )}
                  {s.rightStart && s.rightEnd && (
                    <span className="text-blue-700 dark:text-blue-300">
                      👉 {formatMs(s.rightEnd - s.rightStart)}
                    </span>
                  )}
                  {s.bottleMl && (
                    <span className="text-amber-700 dark:text-amber-300">
                      🍼 {s.bottleMl} ml
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Weekly Chart ─────────────────────────────────────────────────────────────

function WeeklyChart({
  nicaFeeds, niciFeeds, nicaDiapers, niciDiapers, weekStart,
}: {
  nicaFeeds: FeedingSession[];
  niciFeeds: FeedingSession[];
  nicaDiapers: DiaperChange[];
  niciDiapers: DiaperChange[];
  weekStart: Date;
}) {
  const data = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekStart, i);
    const dayStart = startOfDay(day).getTime();
    const dayEnd = endOfDay(day).getTime();
    const inDay = (ts: number) => ts >= dayStart && ts <= dayEnd;

    const nicaF = nicaFeeds.filter(s => inDay(s.createdAt));
    const niciF = niciFeeds.filter(s => inDay(s.createdAt));
    const nicaD = nicaDiapers.filter(d => inDay(d.changedAt));
    const niciD = niciDiapers.filter(d => inDay(d.changedAt));

    return {
      day: format(day, "EEE"),
      "Nica feeds": nicaF.length,
      "Nici feeds": niciF.length,
      "Nica diapers": nicaD.length,
      "Nici diapers": niciD.length,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">Feedings per day</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={20} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Nica feeds" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Nici feeds" fill="#60a5fa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-2">Diapers per day</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={20} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Nica diapers" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Nici diapers" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type View = "day" | "week";

export default function AnalyticsDashboard() {
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const dayStart = useMemo(() => startOfDay(selectedDate).getTime(), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate).getTime(), [selectedDate]);

  const weekStart = useMemo(() => startOfDay(subDays(selectedDate, 6)), [selectedDate]);
  const weekStartMs = useMemo(() => weekStart.getTime(), [weekStart]);
  const weekEndMs = useMemo(() => endOfDay(selectedDate).getTime(), [selectedDate]);

  const { data: dayData, isLoading: dayLoading } = trpc.analytics.dailyStats.useQuery(
    { dayStartMs: dayStart, dayEndMs: dayEnd },
    { enabled: view === "day" }
  );

  const { data: weekData, isLoading: weekLoading } = trpc.analytics.weeklyStats.useQuery(
    { weekStartMs, weekEndMs },
    { enabled: view === "week" }
  );

  const isLoading = view === "day" ? dayLoading : weekLoading;

  const prevDay = () => setSelectedDate(d => subDays(d, 1));
  const nextDay = () => setSelectedDate(d => addDays(d, 1));
  const isToday = format(selectedDate, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm px-4 py-3">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-xl">🍼</span>
            <span className="font-bold text-primary">Baby Tracker</span>
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border text-sm">
            <button
              onClick={() => setView("day")}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors",
                view === "day" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              )}
            >
              Day
            </button>
            <button
              onClick={() => setView("week")}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors",
                view === "week" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              )}
            >
              Week
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4">
        {/* Date navigator */}
        <div className="flex items-center justify-between bg-card rounded-2xl border border-border px-4 py-2.5">
          <button onClick={prevDay} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="font-semibold text-sm">
              {view === "day"
                ? format(selectedDate, "EEEE, d MMMM yyyy")
                : `${format(weekStart, "d MMM")} – ${format(selectedDate, "d MMM yyyy")}`}
            </p>
            {isToday && (
              <span className="text-xs text-primary font-medium">Today</span>
            )}
          </div>
          <button
            onClick={nextDay}
            disabled={isToday}
            className="p-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-2">
              <div className="text-3xl animate-bounce">🍼</div>
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          </div>
        ) : view === "day" && dayData ? (
          <>
            <ChildPanel
              name="Nica"
              icon="👧"
              feedings={dayData.nicaFeeds}
              diapers={dayData.nicaDiapers}
              color="purple"
            />
            <ChildPanel
              name="Nici"
              icon="👶"
              feedings={dayData.niciFeeds}
              diapers={dayData.niciDiapers}
              color="blue"
            />
          </>
        ) : view === "week" && weekData ? (
          <>
            {/* Weekly totals */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Nica — 7 days</p>
                <p className="text-2xl font-bold">{weekData.nicaFeeds.length} <span className="text-sm font-normal text-muted-foreground">feeds</span></p>
                <p className="text-sm text-muted-foreground">{weekData.nicaDiapers.length} diapers</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Nici — 7 days</p>
                <p className="text-2xl font-bold">{weekData.niciFeeds.length} <span className="text-sm font-normal text-muted-foreground">feeds</span></p>
                <p className="text-sm text-muted-foreground">{weekData.niciDiapers.length} diapers</p>
              </div>
            </div>
            {/* Charts */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-primary" />
                <h3 className="font-semibold text-sm">7-Day Trends</h3>
              </div>
              <WeeklyChart
                nicaFeeds={weekData.nicaFeeds}
                niciFeeds={weekData.niciFeeds}
                nicaDiapers={weekData.nicaDiapers}
                niciDiapers={weekData.niciDiapers}
                weekStart={weekStart}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <div className="text-4xl mb-2">📊</div>
            <p>No data for this period</p>
          </div>
        )}
      </div>

      {/* Version footer */}
      <footer className="text-center py-4 pb-8">
        <p className="text-xs text-muted-foreground/50">
          🍼 Baby Tracker v{packageJson.version}
        </p>
      </footer>
    </div>
  );
}
