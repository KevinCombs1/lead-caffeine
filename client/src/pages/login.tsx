import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Loader2, Sun } from "lucide-react";

export default function Login({ onLogin }: { onLogin: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      await onLogin(password);
    } catch (err: any) {
      setError(err.message || "Access denied");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-amber-500/10">
        <CardContent className="pt-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center mx-auto">
              <Sun className="w-6 h-6 text-amber-300/70" />
            </div>
            <h1 className="text-lg font-semibold text-foreground/90" data-testid="text-login-title">Light Engine</h1>
            <p className="text-xs text-muted-foreground">Tax credit intelligence platform</p>
            <p className="text-[10px] text-muted-foreground/40 tracking-wider">D.A.T.A. CLOUDWARE</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter access password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10"
                  data-testid="input-password"
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-xs text-destructive" data-testid="text-login-error">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={!password || loading} data-testid="button-login">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {loading ? "Authenticating..." : "Access"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
