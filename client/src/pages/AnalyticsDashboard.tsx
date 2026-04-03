import { useState, useMemo } from "react";
import packageJson from "../../../package.json";
import { trpc } from "@/lib/trpc";
import { startOfDay, endOfDay, subDays, format, addDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";
import { ChevronLeft, ChevronRight, Baby, Droplets, Clock, TrendingUp, Pencil, Trash2, X, Check, Settings, Plus, Pill } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    // For quick-log entries (start===end), duration is 0 — don't add to total
    const leftDur = (s.leftStart && s.leftEnd && s.leftStart !== s.leftEnd) ? s.leftEnd - s.leftStart : 0;
    const rightDur = (s.rightStart && s.rightEnd && s.rightStart !== s.rightEnd) ? s.rightEnd - s.rightStart : 0;
    totalMs += leftDur + rightDur;
    if (s.bottleMl) { bottleCount++; bottleMlTotal += s.bottleMl; }
    // Use the actual feed start time (leftStart or rightStart) as the reference, falling back to createdAt
    const feedTime = s.leftStart ?? s.rightStart ?? s.createdAt;
    if (!lastFeedTime || feedTime > lastFeedTime) lastFeedTime = feedTime;
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

// ─── Edit Feeding Modal ───────────────────────────────────────────────────────

function msToTimeStr(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeStrToMs(str: string, baseMs: number): number | null {
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const d = new Date(baseMs);
  d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
  return d.getTime();
}

function EditFeedingModal({
  session,
  onClose,
  onSaved,
}: {
  session: FeedingSession;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [leftStart, setLeftStart] = useState(msToTimeStr(session.leftStart));
  const [leftEnd, setLeftEnd] = useState(msToTimeStr(session.leftEnd));
  const [rightStart, setRightStart] = useState(msToTimeStr(session.rightStart));
  const [rightEnd, setRightEnd] = useState(msToTimeStr(session.rightEnd));
  const [bottleMl, setBottleMl] = useState(session.bottleMl ? String(session.bottleMl) : "");

  const updateMutation = trpc.feeding.update.useMutation({
    onSuccess: () => { toast.success("Entry updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  const handleSave = () => {
    const base = session.createdAt;
    updateMutation.mutate({
      id: session.id,
      leftStart: leftStart ? timeStrToMs(leftStart, base) : null,
      leftEnd: leftEnd ? timeStrToMs(leftEnd, base) : null,
      rightStart: rightStart ? timeStrToMs(rightStart, base) : null,
      rightEnd: rightEnd ? timeStrToMs(rightEnd, base) : null,
      bottleMl: bottleMl ? parseInt(bottleMl) : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-3xl p-6 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Edit Feeding</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X size={18} /></button>
        </div>
        <p className="text-xs text-muted-foreground">{format(new Date(session.createdAt), "dd.MM.yyyy")}</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">👈 Left start</label>
            <input type="time" value={leftStart} onChange={e => setLeftStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">👈 Left end</label>
            <input type="time" value={leftEnd} onChange={e => setLeftEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">👉 Right start</label>
            <input type="time" value={rightStart} onChange={e => setRightStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">👉 Right end</label>
            <input type="time" value={rightEnd} onChange={e => setRightEnd(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1">🍼 Bottle (ml)</label>
            <input type="number" value={bottleMl} onChange={e => setBottleMl(e.target.value)}
              placeholder="e.g. 80"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Diaper Modal ────────────────────────────────────────────────────────

function EditDiaperModal({
  diaper,
  onClose,
  onSaved,
}: {
  diaper: DiaperChange;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"wet" | "dirty" | "both">(diaper.type as "wet" | "dirty" | "both");
  const [timeStr, setTimeStr] = useState(msToTimeStr(diaper.changedAt));

  const updateMutation = trpc.diaper.update.useMutation({
    onSuccess: () => { toast.success("Entry updated"); onSaved(); onClose(); },
    onError: (e) => toast.error(`Update failed: ${e.message}`),
  });

  const handleSave = () => {
    const changedAt = timeStrToMs(timeStr, diaper.changedAt) ?? diaper.changedAt;
    updateMutation.mutate({ id: diaper.id, type, changedAt });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-card rounded-t-3xl p-6 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Edit Diaper</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-2">Type</label>
            <div className="flex gap-2">
              {(["wet", "dirty", "both"] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn(
                    "flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors",
                    type === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  )}>
                  {t === "wet" ? "💧 Wet" : t === "dirty" ? "💩 Dirty" : "🔄 Both"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Time</label>
            <input type="time" value={timeStr} onChange={e => setTimeStr(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Child Panel ──────────────────────────────────────────────────────────────

function ChildPanel({
  name, icon, feedings, diapers, onRefresh,
}: {
  name: string;
  icon: string;
  feedings: FeedingSession[];
  diapers: DiaperChange[];
  onRefresh: () => void;
}) {
  const stats = calcFeedingStats(feedings);
  const wet = diapers.filter(d => d.type === "wet").length;
  const dirty = diapers.filter(d => d.type === "dirty").length;
  const both = diapers.filter(d => d.type === "both").length;
  const lastStr = stats.lastFeedTime
    ? format(new Date(stats.lastFeedTime), "HH:mm")
    : "—";
  const lastAgoStr = stats.lastFeedTime
    ? (() => {
        const diffMin = Math.floor((Date.now() - stats.lastFeedTime) / 60000);
        if (diffMin < 60) return `${diffMin}m ago`;
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
      })()
    : undefined;

  const [editFeeding, setEditFeeding] = useState<FeedingSession | null>(null);
  const [editDiaper, setEditDiaper] = useState<DiaperChange | null>(null);

  const deleteFeedingMutation = trpc.feeding.delete.useMutation({
    onSuccess: () => { toast.success("Feeding deleted"); onRefresh(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const deleteDiaperMutation = trpc.diaper.delete.useMutation({
    onSuccess: () => { toast.success("Diaper entry deleted"); onRefresh(); },
    onError: (e) => toast.error(`Delete failed: ${e.message}`),
  });

  const confirmDeleteFeeding = (id: number) => {
    if (window.confirm("Delete this feeding entry?")) {
      deleteFeedingMutation.mutate({ id });
    }
  };

  const confirmDeleteDiaper = (id: number) => {
    if (window.confirm("Delete this diaper entry?")) {
      deleteDiaperMutation.mutate({ id });
    }
  };

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
          sub={lastAgoStr}
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Feedings</p>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {[...feedings].sort((a, b) => b.createdAt - a.createdAt).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-1.5 group">
                <span className="text-muted-foreground font-mono text-xs w-10 shrink-0">
                  {format(new Date(s.createdAt), "HH:mm")}
                </span>
                <span className="flex gap-1.5 flex-wrap flex-1 min-w-0">
                  {s.leftStart && s.leftEnd && (
                    <span className="text-purple-700 dark:text-purple-300">
                      {s.leftStart === s.leftEnd
                        ? `⚡ Left`
                        : `👈 ${formatMs(s.leftEnd - s.leftStart)}`}
                    </span>
                  )}
                  {s.rightStart && s.rightEnd && (
                    <span className="text-blue-700 dark:text-blue-300">
                      {s.rightStart === s.rightEnd
                        ? `⚡ Right`
                        : `👉 ${formatMs(s.rightEnd - s.rightStart)}`}
                    </span>
                  )}
                  {s.bottleMl && (
                    <span className="text-amber-700 dark:text-amber-300">
                      🍼 {s.bottleMl} ml
                    </span>
                  )}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditFeeding(s)}
                    className="p-1 rounded hover:bg-primary/10 text-primary"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirmDeleteFeeding(s.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diaper timeline */}
      {diapers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diapers</p>
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {[...diapers].sort((a, b) => b.changedAt - a.changedAt).map(d => (
              <div key={d.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded-lg px-3 py-1.5 group">
                <span className="text-muted-foreground font-mono text-xs w-10 shrink-0">
                  {format(new Date(d.changedAt), "HH:mm")}
                </span>
                <span className="flex-1">
                  {d.type === "wet" ? "💧 Wet" : d.type === "dirty" ? "💩 Dirty" : "🔄 Both"}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => setEditDiaper(d)}
                    className="p-1 rounded hover:bg-primary/10 text-primary"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirmDeleteDiaper(d.id)}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit modals */}
      {editFeeding && (
        <EditFeedingModal
          session={editFeeding}
          onClose={() => setEditFeeding(null)}
          onSaved={onRefresh}
        />
      )}
      {editDiaper && (
        <EditDiaperModal
          diaper={editDiaper}
          onClose={() => setEditDiaper(null)}
          onSaved={onRefresh}
        />
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

// ─── Log Entry Modal ─────────────────────────────────────────────────────────

type View = "day" | "week";
type LogTab = "feeding" | "diaper";
type BottleType = "none" | "generic" | "own" | "other";

function LogEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<LogTab>("feeding");
  const [child, setChild] = useState<"nica" | "nici">("nica");

  // Feeding fields
  const [leftStart, setLeftStart] = useState("");
  const [leftEnd, setLeftEnd] = useState("");
  const [rightStart, setRightStart] = useState("");
  const [rightEnd, setRightEnd] = useState("");
  const [bottleType, setBottleType] = useState<BottleType>("none");
  const [bottleMl, setBottleMl] = useState("");

  // Diaper fields
  const [diaperType, setDiaperType] = useState<"wet" | "dirty" | "both">("wet");
  const [diaperTime, setDiaperTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  const saveFeedingMutation = trpc.feeding.save.useMutation({
    onSuccess: () => { toast.success("Feeding logged"); onSaved(); onClose(); },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });
  const saveDiaperMutation = trpc.diaper.save.useMutation({
    onSuccess: () => { toast.success("Diaper logged"); onSaved(); onClose(); },
    onError: (e) => toast.error(`Failed: ${e.message}`),
  });

  function timeToMs(str: string, baseMs: number): number | null {
    const match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const d = new Date(baseMs);
    d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
    return d.getTime();
  }

  const handleSaveFeeding = () => {
    const now = Date.now();
    const ls = leftStart ? timeToMs(leftStart, now) : null;
    const le = leftEnd ? timeToMs(leftEnd, now) : null;
    const rs = rightStart ? timeToMs(rightStart, now) : null;
    const re = rightEnd ? timeToMs(rightEnd, now) : null;
    const ml = bottleMl ? parseInt(bottleMl) : null;
    const notes = bottleType === "own" ? "own" : bottleType === "other" ? "other" : null;
    if (!ls && !rs && !ml) { toast.error("Enter at least one feeding detail"); return; }
    saveFeedingMutation.mutate({
      child,
      leftStart: ls, leftEnd: le,
      rightStart: rs, rightEnd: re,
      bottleMl: ml,
      notes: notes ?? undefined,
      createdAt: now,
    });
  };

  const handleSaveDiaper = () => {
    const now = Date.now();
    const changedAt = timeToMs(diaperTime, now) ?? now;
    saveDiaperMutation.mutate({ child, type: diaperType, changedAt, createdAt: now });
  };

  const isPending = saveFeedingMutation.isPending || saveDiaperMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-t-3xl p-5 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Log Entry</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-muted"><X size={18} /></button>
        </div>

        {/* Child selector */}
        <div className="flex gap-2">
          {(["nica", "nici"] as const).map(c => (
            <button key={c} onClick={() => setChild(c)}
              className={cn("flex-1 rounded-xl py-2 text-sm font-semibold border transition-colors",
                child === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
              {c === "nica" ? "👧 Nica" : "👶 Nici"}
            </button>
          ))}
        </div>

        {/* Tab selector */}
        <div className="flex rounded-lg overflow-hidden border border-border text-sm">
          {(["feeding", "diaper"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("flex-1 py-2 font-medium transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
              {t === "feeding" ? "🤱 Feeding" : "💧 Diaper"}
            </button>
          ))}
        </div>

        {tab === "feeding" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">👈 Left start</label>
                <input type="time" value={leftStart} onChange={e => setLeftStart(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">👈 Left end</label>
                <input type="time" value={leftEnd} onChange={e => setLeftEnd(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">👉 Right start</label>
                <input type="time" value={rightStart} onChange={e => setRightStart(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">👉 Right end</label>
                <input type="time" value={rightEnd} onChange={e => setRightEnd(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">🍼 Bottle</label>
              <div className="flex gap-1.5 mb-2">
                {(["none", "generic", "own", "other"] as const).map(bt => (
                  <button key={bt} onClick={() => setBottleType(bt)}
                    className={cn("flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors",
                      bottleType === bt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                    {bt === "none" ? "None" : bt === "generic" ? "🍼" : bt === "own" ? "🍼👩" : "🍼🥛"}
                  </button>
                ))}
              </div>
              {bottleType !== "none" && (
                <input type="number" value={bottleMl} onChange={e => setBottleMl(e.target.value)}
                  placeholder="ml" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">Type</label>
              <div className="flex gap-2">
                {(["wet", "dirty", "both"] as const).map(dt => (
                  <button key={dt} onClick={() => setDiaperType(dt)}
                    className={cn("flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors",
                      diaperType === dt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                    {dt === "wet" ? "💧 Wet" : dt === "dirty" ? "💩 Dirty" : "🔄 Both"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Time</label>
              <input type="time" value={diaperTime} onChange={e => setDiaperTime(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={tab === "feeding" ? handleSaveFeeding : handleSaveDiaper}
            disabled={isPending}
            className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [view, setView] = useState<View>("day");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showLogModal, setShowLogModal] = useState(false);

  const dayStart = useMemo(() => startOfDay(selectedDate).getTime(), [selectedDate]);
  const dayEnd = useMemo(() => endOfDay(selectedDate).getTime(), [selectedDate]);

  const weekStart = useMemo(() => startOfDay(subDays(selectedDate, 6)), [selectedDate]);
  const weekStartMs = useMemo(() => weekStart.getTime(), [weekStart]);
  const weekEndMs = useMemo(() => endOfDay(selectedDate).getTime(), [selectedDate]);

  const utils = trpc.useUtils();

  const { data: dayData, isLoading: dayLoading } = trpc.analytics.dailyStats.useQuery(
    { dayStartMs: dayStart, dayEndMs: dayEnd },
    { enabled: view === "day" }
  );

  const { data: weekData, isLoading: weekLoading } = trpc.analytics.weeklyStats.useQuery(
    { weekStartMs, weekEndMs },
    { enabled: view === "week" }
  );

  const isLoading = view === "day" ? dayLoading : weekLoading;

  const handleRefresh = () => {
    utils.analytics.dailyStats.invalidate();
    utils.analytics.weeklyStats.invalidate();
  };

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
          {/* Right side: Log + Settings */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLogModal(true)}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-primary"
              title="Log entry"
            >
              <Plus size={20} />
            </button>
            <Link href="/vitamind">
              <button className="p-2 rounded-lg hover:bg-muted transition-colors text-amber-500" title="Vitamin D Calendar">
                <Pill size={18} />
              </button>
            </Link>
            <Link href="/settings">
              <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="Settings">
                <Settings size={18} />
              </button>
            </Link>
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

      <div className="max-w-xl mx-auto px-4 py-4 space-y-4 pb-20">
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
              onRefresh={handleRefresh}
            />
            <ChildPanel
              name="Nici"
              icon="👶"
              feedings={dayData.niciFeeds}
              diapers={dayData.niciDiapers}
              onRefresh={handleRefresh}
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

      {/* Log Entry Modal */}
      {showLogModal && (
        <LogEntryModal
          onClose={() => setShowLogModal(false)}
          onSaved={handleRefresh}
        />
      )}
    </div>
  );
}
