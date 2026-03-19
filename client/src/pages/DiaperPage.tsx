import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChild } from "@/contexts/ChildContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Trash2, Clock, Droplets } from "lucide-react";
import { format } from "date-fns";

type DiaperType = "wet" | "dirty" | "both";

const DIAPER_ICONS: Record<DiaperType, string> = {
  wet: "💧",
  dirty: "💩",
  both: "🔄",
};

export default function DiaperPage() {
  const { t } = useLanguage();
  const { child } = useChild();
  const utils = trpc.useUtils();

  const [selected, setSelected] = useState<DiaperType | null>(null);
  const [notes, setNotes] = useState("");

  const saveMutation = trpc.diaper.save.useMutation({
    onSuccess: () => {
      toast.success(t("diaperSaved"));
      setSelected(null);
      setNotes("");
      utils.diaper.recent.invalidate({ child });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.diaper.delete.useMutation({
    onSuccess: () => utils.diaper.recent.invalidate({ child }),
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!selected) {
      toast.error("Please select a diaper type.");
      return;
    }
    const now = Date.now();
    saveMutation.mutate({
      child,
      type: selected,
      notes: notes || undefined,
      changedAt: now,
      createdAt: now,
    });
  };

  const { data: recent, isLoading } = trpc.diaper.recent.useQuery({ child, limit: 20 });

  const diaperTypes: DiaperType[] = ["wet", "dirty", "both"];

  return (
    <div className="container py-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Droplets size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("diaperTitle")}</h1>
        <span className={cn(
          "ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold",
          child === "nica" ? "child-pill-nica active" : "child-pill-nici active"
        )}>
          {t(child)}
        </span>
      </div>

      {/* Quick entry card */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-3">
            {diaperTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelected(prev => prev === type ? null : type)}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 transition-all font-medium text-sm",
                  selected === type
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-secondary text-secondary-foreground border-transparent hover:border-primary/30"
                )}
              >
                <span className="text-2xl">{DIAPER_ICONS[type]}</span>
                <span>{t(type)}</span>
              </button>
            ))}
          </div>

          {/* Notes */}
          <Input
            placeholder={t("notes")}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />

          {/* Save button */}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!selected || saveMutation.isPending}
          >
            {saveMutation.isPending ? t("loading") : t("logDiaper")}
          </Button>
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
          <p className="text-sm text-muted-foreground py-4 text-center">{t("noDiapers")}</p>
        ) : (
          <div className="space-y-2">
            {recent.map(entry => {
              const timeStr = format(new Date(entry.changedAt), "HH:mm");
              const dateStr = format(new Date(entry.changedAt), "dd.MM");
              return (
                <Card key={entry.id} className="shadow-sm">
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{DIAPER_ICONS[entry.type as DiaperType]}</span>
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {t(entry.type as DiaperType)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {dateStr} {t("at")} {timeStr}
                          </p>
                          {entry.notes && (
                            <p className="text-xs text-muted-foreground italic">{entry.notes}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteMutation.mutate({ id: entry.id })}
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
