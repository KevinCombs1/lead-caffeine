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
import NotFound from "@/pages/not-found";
import { Loader2, Sun, LogOut, Box, Radio } from "lucide-react";
import { Link, useLocation } from "wouter";

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/8 bg-card/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sun className="w-3.5 h-3.5 text-amber-400/40" />
            <span className="text-xs font-medium text-amber-300/40 tracking-wide">D.A.T.A. CLOUDWARE</span>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Link href="/"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/" ? "text-amber-300/70 bg-amber-500/10" : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-light-engine"
            >
              Light Engine
            </Link>
            <Link href="/deals"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/deals" ? "text-amber-300/70 bg-amber-500/10" : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-deal-identifier"
            >
              <Radio className="w-3 h-3" />
              Credit Scanner
            </Link>
            <Link href="/shapes"
              className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-all ${
                location === "/shapes" ? "text-amber-300/70 bg-amber-500/10" : "text-muted-foreground/40 hover:text-muted-foreground/60"
              }`}
              data-testid="nav-4d-shapes"
            >
              <Box className="w-3 h-3" />
              4D Shapes
            </Link>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="w-3 h-3" />
          Logout
        </button>
      </div>
      <Switch>
        <Route path="/" component={LightEngine} />
        <Route path="/deals" component={DealsPage} />
        <Route path="/shapes" component={ShapesPage} />
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
          <Loader2 className="w-8 h-8 animate-spin text-amber-400/50 mx-auto" />
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
