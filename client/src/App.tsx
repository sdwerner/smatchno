import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ChildProvider } from "./contexts/ChildContext";
import { TelegramProvider } from "./contexts/TelegramContext";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import SettingsPage from "./pages/SettingsPage";

/**
 * The app is now a Telegram-first analytics dashboard.
 * All data entry happens via the Telegram bot (/log command).
 * This web app is the read-only analytics view, accessible via the
 * "📊 Analytics Dashboard" inline button in the bot.
 * No login is required — the dashboard is public (read-only).
 */
function Router() {
  return (
    <Switch>
      <Route path="/" component={AnalyticsDashboard} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TelegramProvider>
        <ThemeProvider defaultTheme="light">
          <LanguageProvider>
            <ChildProvider>
              <TooltipProvider>
                <Toaster position="top-center" />
                <Router />
              </TooltipProvider>
            </ChildProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TelegramProvider>
    </ErrorBoundary>
  );
}

export default App;
