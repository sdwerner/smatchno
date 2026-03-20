import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ChildProvider } from "./contexts/ChildContext";
import { TelegramProvider } from "./contexts/TelegramContext";
import AppLayout from "./components/AppLayout";
import FeedingPage from "./pages/FeedingPage";
import DiaperPage from "./pages/DiaperPage";
import SummaryPage from "./pages/SummaryPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={FeedingPage} />
      <Route path="/diaper" component={DiaperPage} />
      <Route path="/summary" component={SummaryPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/login" component={LoginPage} />
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
                <AppLayout>
                  <Router />
                </AppLayout>
              </TooltipProvider>
            </ChildProvider>
          </LanguageProvider>
        </ThemeProvider>
      </TelegramProvider>
    </ErrorBoundary>
  );
}

export default App;
