import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Send, LogOut, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t, locale, setLocale } = useLanguage();
  const { user, logout } = useAuth();

  // Telegram settings state
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [digestTime, setDigestTime] = useState("21:00");
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const { data: telegramSettings } = trpc.telegram.getSettings.useQuery();

  useEffect(() => {
    if (telegramSettings && !loaded) {
      setBotToken(telegramSettings.botToken ?? "");
      setChatId(telegramSettings.chatId ?? "");
      setEnabled(telegramSettings.enabled);
      setDigestTime(telegramSettings.digestTime);
      setTimezoneOffset(telegramSettings.timezoneOffset);
      setLoaded(true);
    }
  }, [telegramSettings, loaded]);

  // Auto-detect timezone offset
  useEffect(() => {
    if (!loaded) {
      const offset = -new Date().getTimezoneOffset(); // minutes from UTC
      setTimezoneOffset(offset);
    }
  }, [loaded]);

  const saveMutation = trpc.telegram.saveSettings.useMutation({
    onSuccess: () => toast.success(t("telegramSaved")),
    onError: (e) => toast.error(e.message),
  });

  const testMutation = trpc.telegram.sendTest.useMutation({
    onSuccess: () => toast.success(t("telegramTestSent")),
    onError: () => toast.error(t("telegramTestFailed")),
  });

  const handleSaveTelegram = () => {
    saveMutation.mutate({ botToken, chatId, enabled, digestTime, timezoneOffset });
  };

  return (
    <div className="container py-4 space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <Settings size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">{t("settingsTitle")}</h1>
      </div>

      {/* Language */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t("language")}</p>
          <div className="flex flex-col gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code as Locale)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm font-medium",
                  locale === l.code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:border-primary/40"
                )}
              >
                <span className="text-lg">{l.flag}</span>
                <span>{l.label}</span>
                {locale === l.code && <span className="ml-auto text-primary">✓</span>}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-4">
          <div className="flex items-center gap-2">
            <Send size={16} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">{t("telegramTitle")}</p>
          </div>

          {/* Setup hint */}
          <div className="flex gap-2 bg-muted rounded-lg p-3">
            <Info size={14} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{t("telegramSetupHint")}</p>
          </div>

          {/* Bot token */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("telegramBotToken")}</Label>
            <Input
              type="password"
              placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
            />
          </div>

          {/* Chat ID */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("telegramChatId")}</Label>
            <Input
              placeholder="-1001234567890"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
            />
          </div>

          {/* Digest time */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("telegramDigestTime")}</Label>
            <Input
              type="time"
              value={digestTime}
              onChange={e => setDigestTime(e.target.value)}
            />
          </div>

          {/* Timezone offset */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("telegramTimezone")}</Label>
            <Input
              type="number"
              value={timezoneOffset}
              onChange={e => setTimezoneOffset(parseInt(e.target.value) || 0)}
              min={-720}
              max={840}
              step={30}
            />
            <p className="text-xs text-muted-foreground">
              UTC{timezoneOffset >= 0 ? "+" : ""}{Math.floor(timezoneOffset / 60)}:{String(Math.abs(timezoneOffset % 60)).padStart(2, "0")}
            </p>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t("telegramEnabled")}</Label>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleSaveTelegram}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? t("loading") : t("telegramSave")}
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !botToken || !chatId}
            >
              <Send size={14} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Account</p>
          {user && (
            <p className="text-xs text-muted-foreground">{user.name || user.email}</p>
          )}
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => logout()}
          >
            <LogOut size={14} className="mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
