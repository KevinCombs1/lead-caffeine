import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, Globe2, Activity, Bot, Bug, Radar } from "lucide-react";
import type { SecurityProfile } from "./types";
import type { UseQueryResult } from "@tanstack/react-query";

function getHeaderGrade(headers: any): string {
  if (!headers) return "?";
  if (typeof headers === "object" && headers.grade) return headers.grade;
  if (typeof headers === "object" && headers.score !== undefined) {
    const s = headers.score;
    if (s >= 90) return "A";
    if (s >= 70) return "B";
    if (s >= 50) return "C";
    if (s >= 30) return "D";
    return "F";
  }
  return "?";
}

interface SecurityDialogProps {
  securityDomain: string | null;
  securityQuery: UseQueryResult<SecurityProfile>;
  setSecurityDomain: (val: null) => void;
}

export function SecurityDialog({ securityDomain, securityQuery, setSecurityDomain }: SecurityDialogProps) {
  return (
    <Dialog open={!!securityDomain} onOpenChange={open => { if (!open) setSecurityDomain(null); }}>
      <DialogContent className="max-w-md border-zinc-500/15 bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium text-zinc-200/80 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-zinc-400/50" />
            Defense Profile — {securityDomain}
          </DialogTitle>
        </DialogHeader>
        {securityQuery.isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}
        {securityQuery.data && !securityQuery.data.found && (
          <div className="py-8 text-center space-y-3">
            <ShieldCheck className="w-8 h-8 text-zinc-500/15 mx-auto" />
            <p className="text-sm text-zinc-400/30">No security profile available yet</p>
            <p className="text-xs text-zinc-500/20">Run a scan on this lead to discover their defenses</p>
          </div>
        )}
        {securityQuery.data?.found && (
          <div className="space-y-3">
            {securityQuery.data.wafType && (
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-orange-400/40" />
                  <span className="text-xs text-zinc-300/60">Web Application Firewall</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-orange-300/60">{securityQuery.data.wafType}</span>
                  {securityQuery.data.wafConfidence !== undefined && (
                    <span className="text-[11px] text-zinc-400/30">{securityQuery.data.wafConfidence}%</span>
                  )}
                </div>
              </div>
            )}
            {securityQuery.data.cdnProvider && (
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-3.5 h-3.5 text-blue-400/40" />
                  <span className="text-xs text-zinc-300/60">CDN Provider</span>
                </div>
                <span className="text-xs text-blue-300/60">{securityQuery.data.cdnProvider}</span>
              </div>
            )}
            {securityQuery.data.securityHeaders && (
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400/40" />
                  <span className="text-xs text-zinc-300/60">Security Headers</span>
                </div>
                <span className={`text-sm font-bold ${
                  getHeaderGrade(securityQuery.data.securityHeaders) === "A" ? "text-emerald-400/70" :
                  getHeaderGrade(securityQuery.data.securityHeaders) === "B" ? "text-green-400/60" :
                  getHeaderGrade(securityQuery.data.securityHeaders) === "C" ? "text-yellow-400/60" :
                  "text-red-400/60"
                }`}>
                  {getHeaderGrade(securityQuery.data.securityHeaders)}
                </span>
              </div>
            )}
            {(securityQuery.data.botDetectionScripts?.length || 0) > 0 && (
              <div className="py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Bot className="w-3.5 h-3.5 text-purple-400/40" />
                  <span className="text-xs text-zinc-300/60">Bot Detection</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {securityQuery.data.botDetectionScripts!.map((s, si) => (
                    <Badge key={si} variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/15 text-purple-300/50">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {(securityQuery.data.honeypotIndicators?.length || 0) > 0 && (
              <div className="py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Bug className="w-3.5 h-3.5 text-red-400/40" />
                  <span className="text-xs text-zinc-300/60">Honeypot Indicators</span>
                </div>
                <div className="text-[11px] text-zinc-400/30">
                  {(securityQuery.data.honeypotIndicators as any[]).map((h: any, hi: number) => (
                    <div key={hi}>{typeof h === "string" ? h : JSON.stringify(h)}</div>
                  ))}
                </div>
              </div>
            )}
            {(securityQuery.data.counterIntelSignals?.length || 0) > 0 && (
              <div className="py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Radar className="w-3.5 h-3.5 text-cyan-400/40" />
                  <span className="text-xs text-zinc-300/60">Counter-Intelligence</span>
                </div>
                <div className="text-[11px] text-zinc-400/30">
                  {(securityQuery.data.counterIntelSignals as any[]).map((s: any, si: number) => (
                    <div key={si}>{typeof s === "string" ? s : JSON.stringify(s)}</div>
                  ))}
                </div>
              </div>
            )}
            {securityQuery.data.jsChallenge && (
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded border border-zinc-500/8 bg-zinc-950/5">
                <span className="text-xs text-zinc-300/60">JS Challenge Active</span>
                <span className="text-xs text-orange-400/50">Yes</span>
              </div>
            )}
            <Separator className="bg-zinc-500/8" />
            <div className="text-center py-2">
              <p className="text-xs text-zinc-400/30 italic">Be Graceful — understand their boundaries before approaching</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setSecurityDomain(null)} className="text-zinc-400/30">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
