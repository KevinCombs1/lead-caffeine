import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shape4DCanvas } from "@/components/shapes-4d";
import {
  Search, RefreshCw, Activity,
  Zap, Globe, Building2, Shield, Landmark, Cpu, Banknote, Users,
  Radio, BarChart3, Layers, Filter, Clock, DollarSign,
  Database, Target, X, ChevronRight, Link2, ExternalLink,
  TrendingUp, TrendingDown, AlertTriangle, Sparkles, Eye,
} from "lucide-react";
import { DEAL_TAB_CATEGORIES } from "@shared/schema";

const TAB_ICONS: Record<string, any> = {
  "Capital Markets": BarChart3,
  "Mergers & Acquisitions": Layers,
  "Private Capital": Banknote,
  "Government Contracts": Landmark,
  "Real Estate & Infrastructure": Building2,
  "Regulatory & Legislative": Shield,
  "Intellectual Property": Cpu,
  "Credit & Debt": DollarSign,
  "Energy & Resources": Zap,
  "Labor & Human Capital": Users,
  "Convergence Radar": Radio,
};

const TAB_SHAPES: Record<string, "orthoplex" | "tesseract" | "duoprism" | "hypercone"> = {
  "Capital Markets": "tesseract",
  "Mergers & Acquisitions": "duoprism",
  "Private Capital": "hypercone",
  "Government Contracts": "orthoplex",
  "Real Estate & Infrastructure": "tesseract",
  "Regulatory & Legislative": "orthoplex",
  "Intellectual Property": "duoprism",
  "Credit & Debt": "hypercone",
  "Energy & Resources": "tesseract",
  "Labor & Human Capital": "duoprism",
  "Convergence Radar": "orthoplex",
};

const CURRENT_COLORS: Record<string, string> = {
  transactions: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  trends: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  timelines: "text-violet-400 bg-violet-500/10 border-violet-500/20",
};

const CURRENT_LABELS: Record<string, string> = {
  transactions: "Transactions",
  trends: "Trends",
  timelines: "Timelines",
};

const CURRENT_SHAPES: Record<string, "orthoplex" | "tesseract" | "duoprism" | "hypercone"> = {
  transactions: "orthoplex",
  trends: "duoprism",
  timelines: "hypercone",
};

const US_STATES: Record<string, { name: string; x: number; y: number }> = {
  AL: { name: "Alabama", x: 73, y: 65 }, AK: { name: "Alaska", x: 12, y: 85 },
  AZ: { name: "Arizona", x: 22, y: 62 }, AR: { name: "Arkansas", x: 60, y: 58 },
  CA: { name: "California", x: 10, y: 45 }, CO: { name: "Colorado", x: 32, y: 45 },
  CT: { name: "Connecticut", x: 91, y: 32 }, DE: { name: "Delaware", x: 89, y: 40 },
  FL: { name: "Florida", x: 82, y: 78 }, GA: { name: "Georgia", x: 78, y: 65 },
  HI: { name: "Hawaii", x: 28, y: 88 }, ID: { name: "Idaho", x: 20, y: 25 },
  IL: { name: "Illinois", x: 65, y: 40 }, IN: { name: "Indiana", x: 70, y: 40 },
  IA: { name: "Iowa", x: 58, y: 35 }, KS: { name: "Kansas", x: 48, y: 48 },
  KY: { name: "Kentucky", x: 74, y: 48 }, LA: { name: "Louisiana", x: 60, y: 72 },
  ME: { name: "Maine", x: 95, y: 15 }, MD: { name: "Maryland", x: 86, y: 40 },
  MA: { name: "Massachusetts", x: 93, y: 28 }, MI: { name: "Michigan", x: 72, y: 28 },
  MN: { name: "Minnesota", x: 55, y: 20 }, MS: { name: "Mississippi", x: 65, y: 65 },
  MO: { name: "Missouri", x: 58, y: 48 }, MT: { name: "Montana", x: 28, y: 18 },
  NE: { name: "Nebraska", x: 45, y: 38 }, NV: { name: "Nevada", x: 15, y: 40 },
  NH: { name: "New Hampshire", x: 93, y: 22 }, NJ: { name: "New Jersey", x: 90, y: 36 },
  NM: { name: "New Mexico", x: 28, y: 58 }, NY: { name: "New York", x: 87, y: 26 },
  NC: { name: "North Carolina", x: 82, y: 52 }, ND: { name: "North Dakota", x: 45, y: 18 },
  OH: { name: "Ohio", x: 76, y: 38 }, OK: { name: "Oklahoma", x: 48, y: 55 },
  OR: { name: "Oregon", x: 12, y: 22 }, PA: { name: "Pennsylvania", x: 84, y: 34 },
  RI: { name: "Rhode Island", x: 94, y: 30 }, SC: { name: "South Carolina", x: 81, y: 58 },
  SD: { name: "South Dakota", x: 45, y: 25 }, TN: { name: "Tennessee", x: 72, y: 55 },
  TX: { name: "Texas", x: 45, y: 68 }, UT: { name: "Utah", x: 22, y: 42 },
  VT: { name: "Vermont", x: 91, y: 20 }, VA: { name: "Virginia", x: 83, y: 46 },
  WA: { name: "Washington", x: 13, y: 12 }, WV: { name: "West Virginia", x: 80, y: 44 },
  WI: { name: "Wisconsin", x: 62, y: 24 }, WY: { name: "Wyoming", x: 30, y: 30 },
  DC: { name: "Washington DC", x: 87, y: 42 },
};

function formatValue(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProbabilityBar({ value, large }: { value: number; large?: boolean }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  const glowColor = pct >= 70 ? "rgba(16,185,129,0.4)" : pct >= 40 ? "rgba(245,158,11,0.4)" : "rgba(244,63,94,0.4)";
  return (
    <div className={`flex items-center gap-2 ${large ? "" : ""}`} data-testid="probability-bar">
      <div className={`${large ? "w-24 h-2.5" : "w-16 h-1.5"} bg-white/5 rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full qi-bar ${color}`}
          style={{
            width: `${pct}%`,
            boxShadow: large ? `0 0 8px ${glowColor}` : "none",
          }}
        />
      </div>
      <span className={`font-mono ${large ? "text-sm font-bold" : "text-[11px]"} text-muted-foreground`}>{pct}%</span>
    </div>
  );
}

function HeatMap({ stateData, selectedState, onSelectState }: {
  stateData: { state: string; count: number; totalValue: number }[];
  selectedState: string | null;
  onSelectState: (s: string | null) => void;
}) {
  const maxCount = Math.max(...stateData.map(d => d.count), 1);

  const stateMap = useMemo(() => {
    const m: Record<string, { count: number; totalValue: number }> = {};
    for (const d of stateData) m[d.state] = d;
    return m;
  }, [stateData]);

  return (
    <div className="qi-panel p-4 rounded-xl relative overflow-hidden" style={{ perspective: "1200px" }} data-testid="heatmap-container">
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          background: "radial-gradient(ellipse at 30% 40%, rgba(245,158,11,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(6,182,212,0.06) 0%, transparent 50%)",
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-amber-200/80">Capital Convergence Map</h3>
          {selectedState && (
            <button
              onClick={() => onSelectState(null)}
              className="text-[11px] text-amber-400/60 hover:text-amber-400 transition-colors"
              data-testid="button-clear-state"
            >
              Clear Filter
            </button>
          )}
        </div>
        <div className="relative w-full aspect-[2/1] bg-gradient-to-br from-slate-900/60 to-slate-800/40 rounded-lg overflow-hidden border border-amber-500/5" style={{ transform: "rotateX(1deg)", transformOrigin: "center bottom" }}>
          {Object.entries(US_STATES).map(([code, s]) => {
            const data = stateMap[code];
            const intensity = data ? Math.min(data.count / maxCount, 1) : 0;
            const isSelected = selectedState === code;
            const size = 8 + intensity * 16;
            const opacity = data ? 0.3 + intensity * 0.7 : 0.08;

            return (
              <button
                key={code}
                onClick={() => onSelectState(isSelected ? null : code)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 group"
                style={{ left: `${s.x}%`, top: `${s.y}%` }}
                title={`${s.name}: ${data?.count || 0} events${data?.totalValue ? ` (${formatValue(data.totalValue)})` : ""}`}
                data-testid={`heatmap-state-${code}`}
              >
                <div
                  className={`rounded-full transition-all duration-300 ${
                    isSelected
                      ? "ring-2 ring-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.5)]"
                      : "group-hover:ring-1 group-hover:ring-amber-500/40 group-hover:shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                  }`}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: data
                      ? `rgba(245, 158, 11, ${opacity})`
                      : `rgba(255, 255, 255, ${opacity})`,
                    boxShadow: data && intensity > 0.3
                      ? `0 0 ${intensity * 14}px rgba(245, 158, 11, ${intensity * 0.35}), 0 0 ${intensity * 4}px rgba(245, 158, 11, ${intensity * 0.15})`
                      : "none",
                  }}
                />
                <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-mono text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors">
                  {code}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatsBar({ stats, isLoading }: {
  stats: any;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3" data-testid="stats-bar-loading">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  const items = [
    { label: "Total Events", value: stats?.totalEvents || 0, icon: Database, color: "text-amber-400", glowColor: "rgba(245, 158, 11, 0.08)" },
    { label: "Total Value", value: formatValue(stats?.totalValue || 0), icon: DollarSign, color: "text-emerald-400", glowColor: "rgba(16, 185, 129, 0.08)" },
    { label: "Active Sources", value: stats?.activeSources || 0, icon: Activity, color: "text-cyan-400", glowColor: "rgba(6, 182, 212, 0.08)" },
    { label: "Convergence Points", value: stats?.convergenceCount || 0, icon: Target, color: "text-violet-400", glowColor: "rgba(139, 92, 246, 0.08)" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="stats-bar">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`qi-panel p-3 rounded-lg qi-stagger-${i + 1} relative overflow-hidden group`}
            style={{
              perspective: "800px",
              background: `linear-gradient(135deg, ${item.glowColor}, transparent)`,
            }}
            data-testid={`stat-${item.label.toLowerCase().replace(/\s/g, "-")}`}
          >
            <div className="relative z-10 transition-transform duration-300 group-hover:scale-[1.02]" style={{ transform: "translateZ(0)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span className="text-[11px] text-muted-foreground/60">{item.label}</span>
              </div>
              <div className={`text-lg font-bold ${item.color}`} style={{ textShadow: `0 0 20px ${item.glowColor}` }}>{item.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopOpportunities({ opportunities, onSelect }: {
  opportunities: any[];
  onSelect: (cp: any) => void;
}) {
  if (!opportunities || opportunities.length === 0) return null;

  return (
    <div className="qi-panel p-3 rounded-xl relative overflow-hidden" data-testid="top-opportunities">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(139,92,246,0.15) 0%, transparent 70%)" }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" style={{ animation: "breathe 3s ease-in-out infinite" }} />
          <h3 className="text-xs font-semibold text-violet-300/80">TOP OPPORTUNITIES</h3>
          <div className="ml-auto text-[10px] text-muted-foreground/40">{opportunities.length} detected</div>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {opportunities.map((cp: any, i: number) => {
            const pct = Math.round((cp.probability || 0) * 100);
            const probColor = pct >= 70 ? "text-emerald-400 border-emerald-500/20" : pct >= 40 ? "text-amber-400 border-amber-500/20" : "text-rose-400 border-rose-500/20";
            const probGlow = pct >= 70 ? "rgba(16,185,129,0.15)" : pct >= 40 ? "rgba(245,158,11,0.15)" : "rgba(244,63,94,0.15)";

            return (
              <button
                key={cp.id}
                onClick={() => onSelect(cp)}
                className={`flex-shrink-0 qi-panel rounded-lg p-2.5 min-w-[200px] max-w-[240px] border border-white/5 hover:border-violet-500/20 transition-all duration-300 text-left group qi-stagger-${Math.min(i + 1, 4)}`}
                style={{
                  perspective: "800px",
                  background: `linear-gradient(135deg, ${probGlow}, transparent)`,
                }}
                data-testid={`opportunity-card-${cp.id}`}
              >
                <div className="text-[11px] font-medium text-foreground/80 truncate mb-1.5 group-hover:text-foreground/95 transition-colors">
                  {cp.title}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold font-mono ${probColor}`}>{pct}%</span>
                  {cp.estimatedValue && (
                    <span className="text-[10px] text-emerald-400/60">{formatValue(cp.estimatedValue)}</span>
                  )}
                  {cp.timeHorizon && (
                    <span className="text-[10px] text-muted-foreground/40">{cp.timeHorizon}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  {cp.sector && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/50 truncate max-w-[100px]">{cp.sector}</span>
                  )}
                  {cp.state && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/60 font-mono">{cp.state}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConvergenceCard({ cp, onExpand }: { cp: any; onExpand: (cp: any) => void }) {
  const pct = Math.round((cp.probability || 0) * 100);
  const statusColor = cp.status === "high_confidence" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : cp.status === "detected" ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
    : "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
  const meta = cp.metadata || {};
  const currents = meta.currents || cp.currentsInvolved || [];

  return (
    <div
      className="qi-panel rounded-lg p-4 relative overflow-hidden border border-white/5 hover:border-violet-500/15 transition-all duration-300 group"
      style={{ perspective: "1000px" }}
      data-testid={`convergence-card-${cp.id}`}
    >
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          background: pct >= 70
            ? "radial-gradient(ellipse at 30% 30%, rgba(16,185,129,0.15) 0%, transparent 60%)"
            : "radial-gradient(ellipse at 30% 30%, rgba(245,158,11,0.1) 0%, transparent 60%)",
        }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0 mr-3">
            <h4 className="text-sm font-semibold text-foreground/85 group-hover:text-foreground/95 transition-colors">{cp.title}</h4>
            <Badge variant="outline" className={`text-[9px] mt-1 ${statusColor}`}>
              {cp.status === "high_confidence" ? "High Confidence" : cp.status === "detected" ? "Detected" : "Emerging"}
            </Badge>
          </div>
          <ProbabilityBar value={cp.probability || 0} large />
        </div>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed mb-3 line-clamp-3">{cp.description}</p>

        <div className="flex items-center gap-3 flex-wrap mb-3">
          {cp.estimatedValue && (
            <div className="flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400/60" />
              <span className="text-xs font-bold text-emerald-400/80">{formatValue(cp.estimatedValue)}</span>
            </div>
          )}
          {cp.timeHorizon && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/60">{cp.timeHorizon}</span>
            </div>
          )}
          {meta.sourceCount && (
            <div className="flex items-center gap-1">
              <Database className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/60">{meta.sourceCount} sources</span>
            </div>
          )}
          {meta.eventCount && (
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/60">{meta.eventCount} events</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {currents.map((c: string) => (
            <span key={c} className={`text-[9px] px-2 py-0.5 rounded-full border ${CURRENT_COLORS[c] || "text-muted-foreground border-white/10"}`}>
              {CURRENT_LABELS[c] || c}
            </span>
          ))}
          {cp.sector && (
            <span className="text-[9px] px-2 py-0.5 rounded bg-white/5 text-muted-foreground/50">{cp.sector}</span>
          )}
          {cp.state && (
            <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400/60 font-mono">{cp.state}</span>
          )}
          {cp.geography && !cp.state && (
            <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400/60">{cp.geography}</span>
          )}
          <button
            onClick={() => onExpand(cp)}
            className="ml-auto text-[10px] text-violet-400/60 hover:text-violet-400 transition-colors flex items-center gap-1"
            data-testid={`button-expand-convergence-${cp.id}`}
          >
            <Eye className="w-3 h-3" />
            Details
          </button>
        </div>

        {meta.directions && meta.directions.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/5">
            <div className="text-[10px] text-muted-foreground/40 mb-1">Trend signals:</div>
            {meta.directions.slice(0, 2).map((d: string, i: number) => (
              <div key={i} className="text-[10px] text-cyan-400/50 flex items-center gap-1">
                {d.includes("up") || d.includes("increase") ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {d}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConvergenceDetailPanel({ convergenceId, onClose }: { convergenceId: string; onClose: () => void }) {
  const detailQuery = useQuery<any>({
    queryKey: ["/api/deals/convergence", convergenceId],
    enabled: !!convergenceId,
  });

  const data = detailQuery.data;
  const cp = data?.convergence;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="convergence-detail-panel">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/10 overflow-y-auto" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/5 bg-background/95 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-violet-300/90">Convergence Details</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded" data-testid="button-close-convergence-detail">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {detailQuery.isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : cp ? (
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-base font-bold text-foreground/90 mb-1">{cp.title}</h4>
              <ProbabilityBar value={cp.probability || 0} large />
              <p className="text-xs text-muted-foreground/60 leading-relaxed mt-2">{cp.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {cp.estimatedValue && (
                <div className="qi-panel p-2 rounded-lg">
                  <div className="text-[10px] text-muted-foreground/40">Est. Value</div>
                  <div className="text-sm font-bold text-emerald-400/80">{formatValue(cp.estimatedValue)}</div>
                </div>
              )}
              {cp.timeHorizon && (
                <div className="qi-panel p-2 rounded-lg">
                  <div className="text-[10px] text-muted-foreground/40">Time Horizon</div>
                  <div className="text-sm font-bold text-amber-400/80">{cp.timeHorizon}</div>
                </div>
              )}
              {cp.sector && (
                <div className="qi-panel p-2 rounded-lg">
                  <div className="text-[10px] text-muted-foreground/40">Sector</div>
                  <div className="text-sm font-bold text-foreground/70">{cp.sector}</div>
                </div>
              )}
              {cp.geography && (
                <div className="qi-panel p-2 rounded-lg">
                  <div className="text-[10px] text-muted-foreground/40">Geography</div>
                  <div className="text-sm font-bold text-foreground/70">{cp.geography}</div>
                </div>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {(cp.currentsInvolved || []).map((c: string) => (
                <span key={c} className={`text-[10px] px-2 py-1 rounded-full border ${CURRENT_COLORS[c] || ""}`}>
                  {CURRENT_LABELS[c] || c}
                </span>
              ))}
            </div>

            {data.events && data.events.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-amber-300/70 mb-2 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  Involved Events ({data.events.length})
                </h5>
                <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-hide">
                  {data.events.map((evt: any) => (
                    <div key={evt.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className={`w-1 h-5 rounded-full ${evt.current === "transactions" ? "bg-amber-500/60" : evt.current === "trends" ? "bg-cyan-500/60" : "bg-violet-500/60"}`} />
                      <span className="flex-1 truncate text-foreground/70">{evt.title}</span>
                      {evt.value && <span className="text-emerald-400/60 font-mono">{formatValue(evt.value)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.trends && data.trends.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-cyan-300/70 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" />
                  Related Trends ({data.trends.length})
                </h5>
                <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-hide">
                  {data.trends.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className="w-1 h-5 rounded-full bg-cyan-500/60" />
                      <span className="flex-1 truncate text-foreground/70">{t.metric}</span>
                      <span className={`font-mono ${t.direction === "up" ? "text-emerald-400/60" : "text-rose-400/60"}`}>
                        {t.direction === "up" ? "+" : ""}{t.value?.toFixed?.(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.timelines && data.timelines.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-violet-300/70 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Timeline Events ({data.timelines.length})
                </h5>
                <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-hide">
                  {data.timelines.map((tl: any) => (
                    <div key={tl.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className="w-1 h-5 rounded-full bg-violet-500/60" />
                      <span className="flex-1 truncate text-foreground/70">{tl.title}</span>
                      <span className="text-muted-foreground/40">{formatDate(tl.expectedDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground/40 text-sm">Convergence point not found</div>
        )}
      </div>
    </div>
  );
}

function EntityPanel({ entityId, onClose }: { entityId: string; onClose: () => void }) {
  const entityQuery = useQuery<any>({
    queryKey: ["/api/deals/entities", entityId],
    enabled: !!entityId,
  });

  const data = entityQuery.data;
  const entity = data?.entity;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="entity-panel">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-white/10 overflow-y-auto" style={{ animation: "fadeSlideIn 0.3s ease-out" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/5 bg-background/95 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-amber-300/90">Entity Intelligence</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded" data-testid="button-close-entity-panel">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {entityQuery.isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : entity ? (
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-base font-bold text-foreground/90">{entity.name}</h4>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-300/70">{entity.entityType}</Badge>
                {entity.sector && <Badge variant="outline" className="text-[10px] border-cyan-500/20 text-cyan-300/70">{entity.sector}</Badge>}
                {entity.state && <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground/60 font-mono">{entity.state}</Badge>}
              </div>
            </div>

            {data.sourceNames && data.sourceNames.length > 0 && (
              <div className="qi-panel p-2 rounded-lg">
                <div className="text-[10px] text-muted-foreground/40 mb-1">Cross-Source Corroboration</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-violet-400/80">{data.sourceNames.length} sources</span>
                  <span className="text-[10px] text-muted-foreground/40">|</span>
                  <span className="text-[10px] text-muted-foreground/50">{data.sourceNames.join(", ")}</span>
                </div>
              </div>
            )}

            {data.events && data.events.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-amber-300/70 mb-2">All Events ({data.events.length})</h5>
                <div className="space-y-1 max-h-[250px] overflow-y-auto scrollbar-hide">
                  {data.events.map((evt: any) => (
                    <div key={evt.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className={`w-1 h-5 rounded-full ${evt.current === "transactions" ? "bg-amber-500/60" : evt.current === "trends" ? "bg-cyan-500/60" : "bg-violet-500/60"}`} />
                      <span className="flex-1 truncate text-foreground/70">{evt.title}</span>
                      {evt.value && <span className="text-emerald-400/60 font-mono">{formatValue(evt.value)}</span>}
                      <span className="text-muted-foreground/30">{formatDate(evt.eventDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.relatedTrends && data.relatedTrends.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-cyan-300/70 mb-2">Sector Trends ({data.relatedTrends.length})</h5>
                <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-hide">
                  {data.relatedTrends.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className="w-1 h-5 rounded-full bg-cyan-500/60" />
                      <span className="flex-1 truncate text-foreground/70">{t.metric}</span>
                      <span className="text-muted-foreground/40">{t.direction}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.relatedTimelines && data.relatedTimelines.length > 0 && (
              <div>
                <h5 className="text-xs font-semibold text-violet-300/70 mb-2">Upcoming Timelines ({data.relatedTimelines.length})</h5>
                <div className="space-y-1 max-h-[150px] overflow-y-auto scrollbar-hide">
                  {data.relatedTimelines.map((tl: any) => (
                    <div key={tl.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]">
                      <div className="w-1 h-5 rounded-full bg-violet-500/60" />
                      <span className="flex-1 truncate text-foreground/70">{tl.title}</span>
                      <span className="text-muted-foreground/40">{formatDate(tl.expectedDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground/40 text-sm">Entity not found</div>
        )}
      </div>
    </div>
  );
}

function ConvergenceRadarContent({ convergences, isLoading, onExpandConvergence, activeSub }: {
  convergences: any[];
  isLoading: boolean;
  onExpandConvergence: (cp: any) => void;
  activeSub: string | null;
}) {
  const filtered = useMemo(() => {
    if (!convergences) return [];
    if (!activeSub) return convergences;
    if (activeSub === "Cross-Sector Patterns") {
      return convergences.filter((cp: any) => (cp.currentsInvolved?.length || 0) >= 2 || (cp.metadata?.sourceCount || 0) >= 3);
    }
    if (activeSub === "Prediction Models") {
      return convergences.filter((cp: any) => cp.probability >= 0.4);
    }
    if (activeSub === "Timeline Projections") {
      return convergences.filter((cp: any) => (cp.involvedTimelineIds?.length || 0) > 0 || cp.timeHorizon);
    }
    return convergences;
  }, [convergences, activeSub]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12 relative" data-testid="convergence-empty">
        <div className="w-24 h-24 mx-auto mb-4 opacity-[0.15] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(245,158,11,0.1) 40%, transparent 70%)",
            animation: "coreGlow 4s ease-in-out infinite",
          }}
        />
        <p className="text-sm text-muted-foreground/40">No convergence points detected yet</p>
        <p className="text-[11px] text-muted-foreground/30 mt-1">Compile data first, then convergences auto-detect every 30 minutes</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="convergence-list">
      {filtered.map((cp: any) => (
        <ConvergenceCard key={cp.id} cp={cp} onExpand={onExpandConvergence} />
      ))}
    </div>
  );
}

const TABS = Object.values(DEAL_TAB_CATEGORIES);

export default function DealsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(0);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [selectedConvergenceId, setSelectedConvergenceId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const tabCategory = TABS[activeTab]?.name;
  const subCategories = TABS[activeTab]?.subs || [];
  const isConvergenceTab = tabCategory === "Convergence Radar";

  const statsQuery = useQuery<any>({ queryKey: ["/api/deals/stats"] });
  const heatmapQuery = useQuery<any[]>({ queryKey: ["/api/deals/heatmap"] });
  const sourcesQuery = useQuery<any[]>({ queryKey: ["/api/deals/sources"] });
  const topOppsQuery = useQuery<any[]>({ queryKey: ["/api/deals/top-opportunities"] });
  const convergenceQuery = useQuery<any[]>({
    queryKey: ["/api/deals/convergence"],
    enabled: isConvergenceTab,
  });

  const queryString = `?tabCategory=${encodeURIComponent(tabCategory)}${activeSub ? `&subCategory=${encodeURIComponent(activeSub)}` : ""}${selectedState ? `&state=${selectedState}` : ""}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}${currentFilter ? `&current=${currentFilter}` : ""}&limit=50`;
  const eventsQuery = useQuery<{ events: any[]; total: number }>({
    queryKey: [`/api/deals/events${queryString}`],
    enabled: !isConvergenceTab,
  });

  const fetchAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deals/fetch-all");
      return res.json();
    },
    onSuccess: (data) => {
      let totalFetched = 0;
      let totalStored = 0;
      for (const [, result] of Object.entries(data) as any) {
        totalFetched += result.fetched || 0;
        totalStored += result.stored || 0;
      }
      toast({
        title: "Data Compilation Complete",
        description: `Fetched ${totalFetched} events, stored ${totalStored} new records across all sources.`,
      });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/deals") });
    },
    onError: (err: any) => {
      toast({ title: "Fetch Error", description: err.message, variant: "destructive" });
    },
  });

  const detectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deals/detect-convergences");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Convergence Detection Complete",
        description: `Detected ${data.detected} convergence points.`,
      });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/deals") });
    },
    onError: (err: any) => {
      toast({ title: "Detection Error", description: err.message, variant: "destructive" });
    },
  });

  const fetchSourceMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await apiRequest("POST", `/api/deals/fetch/${slug}`);
      return res.json();
    },
    onSuccess: (data, slug) => {
      toast({
        title: `Source Updated: ${slug}`,
        description: `Fetched ${data.fetched}, stored ${data.stored} events.`,
      });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/deals") });
    },
    onError: (err: any) => {
      toast({ title: "Fetch Error", description: err.message, variant: "destructive" });
    },
  });

  const events = eventsQuery.data?.events || [];
  const totalEvents = eventsQuery.data?.total || 0;
  const convergenceCount = statsQuery.data?.convergenceCount || 0;

  const handleOpportunitySelect = useCallback((cp: any) => {
    const convergenceTabIndex = TABS.findIndex(t => t.name === "Convergence Radar");
    if (convergenceTabIndex >= 0) {
      setActiveTab(convergenceTabIndex);
      setActiveSub(null);
    }
    setSelectedConvergenceId(cp.id);
  }, []);

  return (
    <div className="min-h-screen bg-background relative" data-testid="deals-page">
      <div className="relative z-10 p-4 space-y-4">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 relative" style={{ perspective: "600px", animation: "coreGlow 4s ease-in-out infinite" }}>
              <Shape4DCanvas shapeKey="orthoplex" autoRotate={true} scale={1.2} opacity={0.7} className="w-full h-full" showControls={false} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-amber-200/90" data-testid="text-page-title" style={{ textShadow: "0 0 30px rgba(245, 158, 11, 0.15)" }}>
                3D Deal Paradise
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Capital convergence across all dimensions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <Input
                placeholder="Search all deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-8 pl-8 text-xs bg-white/3 border-white/8 focus:border-amber-500/30"
                data-testid="input-search"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
              className="h-8 text-[11px] border-violet-500/20 text-violet-300/70 hover:bg-violet-500/10 qi-button transition-all"
              data-testid="button-detect-convergences"
            >
              {detectMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Target className="w-3.5 h-3.5 mr-1.5" />
              )}
              Detect
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchAllMutation.mutate()}
              disabled={fetchAllMutation.isPending}
              className="h-8 text-[11px] border-amber-500/20 text-amber-300/70 hover:bg-amber-500/10 qi-button transition-all"
              data-testid="button-compile-all"
            >
              {fetchAllMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              Compile All
            </Button>
          </div>
        </div>

        <TopOpportunities
          opportunities={topOppsQuery.data || []}
          onSelect={handleOpportunitySelect}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <HeatMap
              stateData={heatmapQuery.data || []}
              selectedState={selectedState}
              onSelectState={setSelectedState}
            />
          </div>
          <div className="space-y-3">
            <StatsBar stats={statsQuery.data} isLoading={statsQuery.isLoading} />

            <div className="qi-panel p-3 rounded-lg relative overflow-hidden" data-testid="current-filters" style={{ perspective: "800px" }}>
              <h4 className="text-[11px] font-semibold text-muted-foreground/60 mb-2 relative z-10">THE THREE CURRENTS</h4>
              <div className="flex gap-2 relative z-10">
                {Object.entries(CURRENT_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCurrentFilter(currentFilter === key ? null : key)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all duration-300 ${
                      currentFilter === key
                        ? CURRENT_COLORS[key] + " qi-active shadow-[0_0_8px_rgba(255,255,255,0.05)]"
                        : "text-muted-foreground/50 border-white/5 hover:border-white/10"
                    }`}
                    style={{
                      transform: currentFilter === key ? "perspective(800px) rotateX(1deg) scale(1.03)" : "perspective(800px) rotateX(0deg)",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                    data-testid={`filter-current-${key}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="qi-panel p-3 rounded-lg" data-testid="sources-panel">
              <h4 className="text-[11px] font-semibold text-muted-foreground/60 mb-2">DATA SOURCES ({sourcesQuery.data?.length || 0})</h4>
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto scrollbar-hide">
                {sourcesQuery.data?.map((src: any) => (
                  <div key={src.id} className="flex items-center justify-between group/src">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full transition-shadow ${
                        src.status === "active"
                          ? "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.4)]"
                          : "bg-gray-500"
                      }`} />
                      <span className="text-[11px] text-muted-foreground/70 group-hover/src:text-muted-foreground/90 transition-colors">{src.name}</span>
                    </div>
                    <button
                      onClick={() => fetchSourceMutation.mutate(src.slug)}
                      disabled={fetchSourceMutation.isPending}
                      className="text-[10px] text-amber-400/50 hover:text-amber-400 qi-button transition-all px-1.5 py-0.5 rounded"
                      data-testid={`button-fetch-${src.slug}`}
                    >
                      Fetch
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="qi-panel rounded-xl overflow-hidden relative" data-testid="tabs-container" style={{ perspective: "1200px" }}>
          <div className="absolute top-2 right-2 w-16 h-16 pointer-events-none opacity-[0.06] z-0 transition-all duration-500 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(245,158,11,0.3) 0%, transparent 70%)",
              animation: "coreGlow 5s ease-in-out infinite",
            }}
          />

          <div className="flex items-center gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-hide border-b border-white/5 relative z-10">
            {TABS.map((tab, i) => {
              const Icon = TAB_ICONS[tab.name] || Activity;
              const count = tab.name === "Convergence Radar"
                ? convergenceCount
                : (statsQuery.data?.eventsByTab?.[tab.name] || 0);
              const isActive = activeTab === i;
              const isRadar = tab.name === "Convergence Radar";
              return (
                <button
                  key={tab.name}
                  onClick={() => { setActiveTab(i); setActiveSub(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-all duration-300 qi-button ${
                    isActive
                      ? "text-amber-300/90 bg-amber-500/8 border-b-2 border-amber-500/40 qi-glow-click"
                      : "text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-white/3"
                  }`}
                  style={{
                    transform: isActive
                      ? "perspective(800px) rotateX(1deg) translateY(-1px)"
                      : "perspective(800px) rotateX(0deg)",
                    boxShadow: isActive ? "0 -2px 12px rgba(245, 158, 11, 0.08)" : "none",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  data-testid={`tab-${tab.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Icon className={`w-3 h-3 ${isRadar && convergenceCount > 0 && !isActive ? "text-violet-400" : ""}`}
                    style={isRadar && convergenceCount > 0 && !isActive ? { animation: "breathe 3s ease-in-out infinite" } : {}}
                  />
                  {tab.name}
                  {count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                      isActive ? "bg-amber-500/20 text-amber-300"
                      : isRadar ? "bg-violet-500/20 text-violet-300"
                      : "bg-white/5 text-muted-foreground/40"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div key={tabCategory} className="p-3 relative z-10 qi-shift">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-3 h-3 text-muted-foreground/40" />
              {subCategories.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setActiveSub(activeSub === sub ? null : sub)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all duration-300 ${
                    activeSub === sub
                      ? "text-cyan-300 bg-cyan-500/10 border-cyan-500/20 shadow-[0_0_6px_rgba(6,182,212,0.15)]"
                      : "text-muted-foreground/50 border-white/5 hover:border-white/10"
                  }`}
                  style={{
                    transform: activeSub === sub ? "perspective(600px) rotateX(1deg) scale(1.02)" : "none",
                    transition: "all 0.25s ease",
                  }}
                  data-testid={`filter-sub-${sub.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {sub}
                </button>
              ))}
              {selectedState && (
                <Badge variant="outline" className="text-[10px] border-amber-500/20 text-amber-300/70">
                  <Globe className="w-2.5 h-2.5 mr-1" />
                  {US_STATES[selectedState]?.name || selectedState}
                </Badge>
              )}
              <div className="ml-auto text-[11px] text-muted-foreground/40">
                {isConvergenceTab
                  ? `${convergenceQuery.data?.length || 0} convergences`
                  : `${totalEvents} events`
                }
              </div>
            </div>

            {isConvergenceTab ? (
              <ConvergenceRadarContent
                convergences={convergenceQuery.data || []}
                isLoading={convergenceQuery.isLoading}
                onExpandConvergence={(cp) => setSelectedConvergenceId(cp.id)}
                activeSub={activeSub}
              />
            ) : eventsQuery.isLoading ? (
              <div className="space-y-2" data-testid="events-loading">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 relative" data-testid="events-empty">
                <div className="w-24 h-24 mx-auto mb-4 opacity-[0.15] rounded-full"
                  style={{
                    background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(245,158,11,0.1) 40%, transparent 70%)",
                    animation: "coreGlow 4s ease-in-out infinite",
                  }}
                />
                <p className="text-sm text-muted-foreground/40">No events compiled yet</p>
                <p className="text-[11px] text-muted-foreground/30 mt-1">Click "Compile All" to fetch from all sources</p>
              </div>
            ) : (
              <div className="space-y-1" data-testid="events-list">
                {events.map((evt: any, idx: number) => (
                  <div
                    key={evt.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.015] hover:bg-white/[0.04] transition-all duration-300 group border border-transparent hover:border-white/5"
                    style={{
                      perspective: "800px",
                      transform: "translateZ(0)",
                      animationDelay: `${idx * 30}ms`,
                    }}
                    data-testid={`event-row-${evt.id}`}
                  >
                    <div
                      className={`w-1 h-8 rounded-full transition-shadow duration-300 ${
                        evt.current === "transactions" ? "bg-amber-500/60 group-hover:shadow-[0_0_6px_rgba(245,158,11,0.3)]" :
                        evt.current === "trends" ? "bg-cyan-500/60 group-hover:shadow-[0_0_6px_rgba(6,182,212,0.3)]" :
                        "bg-violet-500/60 group-hover:shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground/80 truncate group-hover:text-foreground/95 transition-colors">{evt.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/40">{evt.eventType}</span>
                        {evt.subCategory && (
                          <span className="text-[10px] text-cyan-400/40">{evt.subCategory}</span>
                        )}
                        {evt.entityId && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedEntityId(evt.entityId); }}
                            className="text-[10px] text-violet-400/50 hover:text-violet-400 flex items-center gap-0.5 transition-colors"
                            data-testid={`button-entity-${evt.entityId}`}
                          >
                            <Building2 className="w-2.5 h-2.5" />
                            Entity
                          </button>
                        )}
                      </div>
                    </div>
                    {evt.value && (
                      <span className="text-xs font-bold text-emerald-400/70 group-hover:text-emerald-400/90 transition-colors" style={{ textShadow: "0 0 12px rgba(16, 185, 129, 0.1)" }} data-testid={`event-value-${evt.id}`}>
                        {formatValue(evt.value)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                      {formatDate(evt.eventDate)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] border ${CURRENT_COLORS[evt.current] || "text-muted-foreground border-white/10"}`}
                    >
                      {CURRENT_LABELS[evt.current] || evt.current}
                    </Badge>
                    {evt.probability != null && (
                      <ProbabilityBar value={evt.probability} />
                    )}
                    {evt.state && (
                      <span className="text-[10px] font-mono text-muted-foreground/30">{evt.state}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedConvergenceId && (
        <ConvergenceDetailPanel
          convergenceId={selectedConvergenceId}
          onClose={() => setSelectedConvergenceId(null)}
        />
      )}

      {selectedEntityId && (
        <EntityPanel
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
        />
      )}
    </div>
  );
}
