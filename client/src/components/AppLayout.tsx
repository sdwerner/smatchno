import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import { useChild } from "@/contexts/ChildContext";
import { useTelegram } from "@/contexts/TelegramContext";
import { useLocation } from "wouter";
import { Baby, Droplets, BarChart2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated, loading } = useAuth();
  const { isTelegramApp, tgUser } = useTelegram();
  const { t, locale, setLocale } = useLanguage();
  const { child, setChild } = useChild();
  const [location, navigate] = useLocation();

  // In Telegram Mini App, skip Manus OAuth — user is authenticated via Telegram
  const effectivelyAuthenticated = isTelegramApp ? true : isAuthenticated;
  const effectivelyLoading = isTelegramApp ? false : loading;

  // Redirect to login if not authenticated (only for non-Telegram users)
  if (!effectivelyLoading && !effectivelyAuthenticated && location !== "/login") {
    navigate("/login");
    return null;
  }

  if (effectivelyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="text-4xl">🍼</div>
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!effectivelyAuthenticated) {
    return <>{children}</>;
  }

  const navItems = [
    { path: "/", icon: Baby, label: t("navFeeding") },
    { path: "/diaper", icon: Droplets, label: t("navDiaper") },
    { path: "/summary", icon: BarChart2, label: t("navSummary") },
    { path: "/settings", icon: Settings, label: t("navSettings") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background max-w-[480px] mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          {/* App name / Telegram user */}
          <div className="flex flex-col leading-tight">
            <span className="font-bold text-primary text-base">🍼 {t("appName")}</span>
            {isTelegramApp && tgUser && (
              <span className="text-[10px] text-muted-foreground">{tgUser.first_name}</span>
            )}
          </div>

          {/* Child selector */}
          <div className="flex items-center gap-1.5 flex-1 justify-center">
            <button
              onClick={() => setChild("nica")}
              className={cn(
                "px-3 py-1 rounded-full text-sm font-semibold transition-all child-pill-nica",
                child === "nica" && "active shadow-sm"
              )}
            >
              {t("nica")}
            </button>
            <button
              onClick={() => setChild("nici")}
              className={cn(
                "px-3 py-1 rounded-full text-sm font-semibold transition-all child-pill-nici",
                child === "nici" && "active shadow-sm"
              )}
            >
              {t("nici")}
            </button>
          </div>

          {/* Language switcher */}
          <div className="flex items-center gap-0.5">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLocale(l.code as Locale)}
                className={cn(
                  "text-base rounded px-1 py-0.5 transition-all",
                  locale === l.code
                    ? "opacity-100 scale-110"
                    : "opacity-40 hover:opacity-70"
                )}
                title={l.label}
              >
                {l.flag}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 bg-card border-t border-border shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-all",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={cn(isActive && "drop-shadow-sm")}
                />
                <span className={cn("text-[10px] font-medium", isActive && "font-semibold")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
