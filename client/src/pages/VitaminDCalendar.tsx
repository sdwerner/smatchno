import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowLeft, Pill } from "lucide-react";
import { Link } from "wouter";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isToday, isFuture } from "date-fns";

// Vienna UTC offset in ms — used to compute day boundaries server-side
const VIENNA_OFFSET_MS = 60 * 60 * 1000; // UTC+1 (DST handled by browser display)

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getDayBoundaries(date: Date): { startMs: number; endMs: number } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  // Convert browser-local midnight to UTC by subtracting the Vienna offset
  // (the server stores givenAt in UTC, and the calendar procedure uses VIENNA_OFFSET_MS)
  return {
    startMs: start.getTime() - VIENNA_OFFSET_MS,
    endMs: end.getTime() - VIENNA_OFFSET_MS,
  };
}

const CHILD_LABELS = {
  nica: { label: "Nica", icon: "👧", color: "text-pink-600" },
  nici: { label: "Nici", icon: "👶", color: "text-blue-600" },
} as const;

type Child = keyof typeof CHILD_LABELS;

export default function VitaminDCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const monthStart = useMemo(() => startOfMonth(currentMonth), [currentMonth]);
  const monthEnd = useMemo(() => endOfMonth(currentMonth), [currentMonth]);

  const { startMs, endMs } = useMemo(() => getDayBoundaries(monthStart), [monthStart]);
  const { endMs: endMsEnd } = useMemo(() => getDayBoundaries(monthEnd), [monthEnd]);

  const { data: calendar, isLoading } = trpc.vitaminD.calendar.useQuery(
    { startMs, endMs: endMsEnd },
    { staleTime: 60_000 }
  );

  const utils = trpc.useUtils();
  const logMutation = trpc.vitaminD.log.useMutation({
    onSuccess: () => {
      utils.vitaminD.calendar.invalidate();
    },
  });

  const days = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: monthEnd }),
    [monthStart, monthEnd]
  );

  // Pad with empty cells so the calendar starts on the correct weekday (Mon=0)
  const firstDayOfWeek = (monthStart.getDay() + 6) % 7; // Mon=0, Sun=6

  const prevMonth = () => {
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const handleLog = (child: Child, date: Date) => {
    // Use noon Vienna time for the givenAt timestamp
    const noon = new Date(date);
    noon.setHours(9, 0, 0, 0);
    logMutation.mutate({ child, givenAt: noon.getTime() });
  };

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Pill className="h-6 w-6 text-amber-600" />
            <h1 className="text-2xl font-bold text-amber-900">Vitamin D</h1>
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 mb-4 text-sm text-gray-600">
          <span className="flex items-center gap-1"><span className="text-green-600 text-lg">✅</span> Given</span>
          <span className="flex items-center gap-1"><span className="text-red-500 text-lg">❌</span> Missed</span>
          <span className="flex items-center gap-1"><span className="text-gray-400 text-lg">—</span> Future / no data</span>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-gray-800">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button variant="ghost" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Per-child calendars */}
        {(["nica", "nici"] as Child[]).map(child => {
          const { label, icon, color } = CHILD_LABELS[child];
          return (
            <div key={child} className="bg-white rounded-2xl shadow-sm border border-amber-100 mb-6 overflow-hidden">
              {/* Child header */}
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <span className="text-xl">{icon}</span>
                <span className={`font-semibold text-lg ${color}`}>{label}</span>
              </div>

              {/* Calendar grid */}
              <div className="p-3">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty padding cells */}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}

                  {days.map(day => {
                    const key = toDateKey(day);
                    const entry = calendar?.[key];
                    const given = entry?.[child] ?? false;
                    const future = isFuture(day) && !isToday(day);
                    const inMonth = isSameMonth(day, currentMonth);

                    let statusIcon: string;
                    let bgClass: string;
                    let clickable = false;

                    if (!inMonth) {
                      statusIcon = "";
                      bgClass = "bg-gray-50 opacity-30";
                    } else if (future) {
                      statusIcon = "—";
                      bgClass = "bg-gray-50 text-gray-300";
                    } else if (isLoading) {
                      statusIcon = "·";
                      bgClass = "bg-gray-50 animate-pulse";
                    } else if (given) {
                      statusIcon = "✅";
                      bgClass = "bg-green-50 border border-green-200";
                    } else {
                      statusIcon = "❌";
                      bgClass = "bg-red-50 border border-red-200 cursor-pointer hover:bg-red-100 active:scale-95 transition-transform";
                      clickable = true;
                    }

                    return (
                      <div
                        key={key}
                        className={`rounded-lg p-1 flex flex-col items-center min-h-[52px] ${bgClass} ${isToday(day) ? "ring-2 ring-amber-400" : ""}`}
                        onClick={clickable ? () => handleLog(child, day) : undefined}
                        title={clickable ? `Log Vitamin D for ${label} on ${format(day, "dd.MM")}` : undefined}
                      >
                        <span className="text-xs text-gray-500 font-medium">{format(day, "d")}</span>
                        <span className="text-base leading-none mt-0.5">{statusIcon}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Month summary */}
              {!isLoading && calendar && (
                <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-sm text-gray-600 flex gap-4">
                  <span>
                    ✅ {days.filter(d => !isFuture(d) || isToday(d)).filter(d => calendar[toDateKey(d)]?.[child]).length} given
                  </span>
                  <span>
                    ❌ {days.filter(d => !isFuture(d) && !isToday(d)).filter(d => !calendar[toDateKey(d)]?.[child]).length} missed
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Quick log today button */}
        <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Log Vitamin D for today</p>
          <div className="flex gap-3">
            {(["nica", "nici"] as Child[]).map(child => {
              const { label, icon } = CHILD_LABELS[child];
              const todayKey = toDateKey(new Date());
              const alreadyGiven = calendar?.[todayKey]?.[child] ?? false;
              return (
                <Button
                  key={child}
                  variant={alreadyGiven ? "outline" : "default"}
                  className={alreadyGiven ? "opacity-60" : "bg-amber-500 hover:bg-amber-600 text-white"}
                  disabled={alreadyGiven || logMutation.isPending}
                  onClick={() => handleLog(child, new Date())}
                >
                  {icon} {label} {alreadyGiven ? "✅" : "💊"}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
