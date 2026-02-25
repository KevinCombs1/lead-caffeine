import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Login from "@/pages/login";
import LightEngine from "@/pages/light";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-end p-2 border-b border-border">
        <button
          onClick={onLogout}
          className="text-xs text-muted-foreground transition-colors"
          data-testid="button-logout"
        >
          Logout
        </button>
      </div>
      <Switch>
        <Route path="/" component={LightEngine} />
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
