import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Login from "@/pages/login";
import LightEngine from "@/pages/light";
import ShapesPage from "@/pages/shapes";
import DealsPage from "@/pages/deals";
import PortfolioPage from "@/pages/portfolio";
import HivePage from "@/pages/hive";
import CarpenterAntsPage from "@/pages/carpenter-ants";
import ManifestoPage from "@/pages/manifesto";
import DocsPage from "@/pages/docs";
import NotFound from "@/pages/not-found";
import { Loader2, Sun, LogOut, Box, Radio, Palette, Contrast, FolderOpen, Flower2, Bug, ScrollText, BookOpen } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Link, useLocation } from "wouter";

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [location] = useLocation();
  const { theme, cycleTheme, maxContrast, toggleMaxContrast } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <div className={`flex items-center justify-between px-4 py-2 border-b ${theme.accentBorder} bg-card/30`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sun className={`w-3.5 h-3.5 ${theme.accentClass} opacity-40`} />
            <span className={`text-xs font-medium ${theme.accentClass} opacity-40 tracking-wide`}>D.A.T.A. CLOUDWARE</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Link href="/"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-light-engine"
            >
              Light Engine
            </Link>
            <Link href="/portfolio"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/portfolio" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-portfolio"
            >
              <FolderOpen className="w-3 h-3" />
              Portfolio
            </Link>
            <Link href="/deals"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/deals" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-deal-identifier"
            >
              <Radio className="w-3 h-3" />
              Credit Scanner
            </Link>
            <Link href="/shapes"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/shapes" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-4d-shapes"
            >
              <Box className="w-3 h-3" />
              4D Shapes
            </Link>
            <Link href="/hive"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/hive" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-beauteous-brigade"
            >
              <Flower2 className="w-3 h-3" />
              Beauteous Brigade
            </Link>
            <Link href="/carpenter-ants"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/carpenter-ants" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-carpenter-ants"
            >
              <Bug className="w-3 h-3" />
              Carpenter Ants
            </Link>
            <Link href="/manifesto"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/manifesto" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-manifesto"
            >
              <ScrollText className="w-3 h-3" />
              Manifesto
            </Link>
            <Link href="/docs"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/docs" ? `${theme.accentText} ${theme.accentBg}` : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-docs"
            >
              <BookOpen className="w-3 h-3" />
              Docs
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMaxContrast}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              maxContrast
                ? "text-foreground bg-foreground/10 rounded px-1.5 py-0.5"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
            data-testid="button-max-contrast"
            title={maxContrast ? "Max Contrast: ON" : "Max Contrast: OFF"}
          >
            <Contrast className="w-3 h-3" />
          </button>
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="button-theme-cycle"
            title={`Theme: ${theme.label}`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/20"
              style={{ backgroundColor: theme.dotColor }}
            />
            <Palette className="w-3 h-3" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
        </div>
      </div>
      <Switch>
        <Route path="/" component={LightEngine} />
        <Route path="/portfolio" component={PortfolioPage} />
        <Route path="/deals" component={DealsPage} />
        <Route path="/shapes" component={ShapesPage} />
        <Route path="/hive" component={HivePage} />
        <Route path="/carpenter-ants" component={CarpenterAntsPage} />
        <Route path="/manifesto" component={ManifestoPage} />
        <Route path="/docs" component={DocsPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function AppContent() {
  const { authenticated, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50 mx-auto" />
          <p className="text-xs font-mono text-muted-foreground">INITIALIZING...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Login onLogin={login} />;
  }

  return <AuthenticatedApp onLogout={logout} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
