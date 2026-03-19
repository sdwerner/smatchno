import { getLoginUrl } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import { LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { t, locale, setLocale } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Logo */}
        <div className="space-y-2">
          <div className="text-7xl">🍼</div>
          <h1 className="text-3xl font-bold text-primary">{t("appName")}</h1>
          <p className="text-muted-foreground text-sm">Nica & Nici</p>
        </div>

        {/* Language switcher */}
        <div className="flex justify-center gap-3">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code as Locale)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                locale === l.code
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>

        {/* Login button */}
        <Button
          size="lg"
          className="w-full text-base font-semibold py-6"
          onClick={() => (window.location.href = getLoginUrl())}
        >
          Sign in to Baby Tracker
        </Button>

        <p className="text-xs text-muted-foreground">
          Shared access for both parents · Nica & Nici
        </p>
      </div>
    </div>
  );
}
