import { useState, useMemo, useEffect } from "react";
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
  FileText, Plus, Trash2, ChevronDown, ChevronUp, Scan, Sprout,
  CheckCircle2, XCircle, Circle, Loader2, Factory, Beaker, KeyRound,
} from "lucide-react";
import { DEAL_TAB_CATEGORIES } from "@shared/schema";

const TAB_ICONS: Record<string, any> = {
  "Capital Activity": BarChart3,
  "M&A Signals": Layers,
  "Private Funding": Banknote,
  "Gov. Contracts": Landmark,
  "Real Estate & Energy": Building2,
  "Regulatory & Tax Law": Shield,
  "IP & Patents": Cpu,
  "Credit & Debt": DollarSign,
  "Clean Energy": Zap,
  "Workforce Signals": Users,
  "Credit Intelligence": Scan,
};

const TAB_SHAPES: Record<string, "orthoplex" | "tesseract" | "duoprism" | "hypercone"> = {
  "Capital Activity": "tesseract",
  "M&A Signals": "duoprism",
  "Private Funding": "hypercone",
  "Gov. Contracts": "orthoplex",
  "Real Estate & Energy": "tesseract",
  "Regulatory & Tax Law": "orthoplex",
  "IP & Patents": "duoprism",
  "Credit & Debt": "hypercone",
  "Clean Energy": "tesseract",
  "Workforce Signals": "duoprism",
  "Credit Intelligence": "orthoplex",
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

function formatValue(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "$0";
  const num = Number(val);
  if (num >= 1e12) return `$${(num / 1e12).toFixed(1)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
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
          <h3 className="text-sm font-semibold text-amber-200/80">Credit Opportunity Heatmap</h3>
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
    { label: "Credits Tracked", value: stats?.creditsTracked || 38, icon: Scan, color: "text-amber-400", glowColor: "rgba(245, 158, 11, 0.08)" },
    { label: "Gaps Detected", value: stats?.totalGaps || 0, icon: Target, color: "text-rose-400", glowColor: "rgba(244, 63, 94, 0.08)" },
    { label: "Est. Unclaimed", value: formatValue(stats?.totalUnclaimedValue || 0), icon: DollarSign, color: "text-emerald-400", glowColor: "rgba(16, 185, 129, 0.08)" },
    { label: "Companies Scanned", value: stats?.companiesScanned || 0, icon: Building2, color: "text-cyan-400", glowColor: "rgba(6, 182, 212, 0.08)" },
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
                <div className="text-[10px] text-muted-foreground/40 mb-1">Verified Across Sources</div>
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

const REVENUE_PRESETS = [
  { label: "$10M – $100M", min: 10_000_000, max: 100_000_000 },
  { label: "$100M – $500M", min: 100_000_000, max: 500_000_000 },
  { label: "$500M – $1B", min: 500_000_000, max: 1_000_000_000 },
];


function CompanyDiscoveryContent() {
  const [industry, setIndustry] = useState("");
  const [revenueMin, setRevenueMin] = useState(10_000_000);
  const [revenueMax, setRevenueMax] = useState(100_000_000);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const industriesQuery = useQuery<string[]>({ queryKey: ["/api/discovery/industries"] });
  const batchesQuery = useQuery<any[]>({ queryKey: ["/api/discovery/batches"] });
  const statusQuery = useQuery<any>({
    queryKey: ["/api/discovery/status"],
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.phase === "discovering" ? 1500 : false;
    },
  });
  const batchDetailQuery = useQuery<any>({
    queryKey: ["/api/discovery/batches", activeBatchId],
    enabled: !!activeBatchId,
  });

  const discoverMutation = useMutation({
    mutationFn: async (count: number) => {
      const res = await apiRequest("POST", "/api/discovery/batches", { industry, revenueMin, revenueMax, count });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/status"] });
    },
  });

  const isDiscovering = statusQuery.data?.phase === "discovering";
  const progress = statusQuery.data;

  useEffect(() => {
    if (progress?.phase === "idle" && progress?.batchId && !activeBatchId) {
      setActiveBatchId(progress.batchId);
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/batches"] });
    }
  }, [progress?.phase, progress?.batchId]);

  const industries = industriesQuery.data || [];
  const batches = batchesQuery.data || [];
  const batchDetail = batchDetailQuery.data;

  return (
    <div className="space-y-4" data-testid="company-discovery">
      <div className="qi-panel rounded-xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ background: "radial-gradient(ellipse at 30% 30%, rgba(245,158,11,0.2) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Factory className="w-4 h-4 text-amber-400/70" />
            <h3 className="text-xs font-semibold text-amber-300/80" data-testid="text-discovery-title">DISCOVER COMPANIES</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground/50 mb-1 block">Industry</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full h-8 px-2 text-xs bg-white/5 border border-white/10 rounded-lg text-foreground/80 focus:border-amber-500/30 focus:outline-none"
                data-testid="select-industry"
              >
                <option value="">Select industry...</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground/50 mb-1 block">Revenue Range</label>
              <div className="flex gap-1">
                {REVENUE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => { setRevenueMin(p.min); setRevenueMax(p.max); }}
                    className={`flex-1 text-[9px] px-1.5 py-1.5 rounded-md border transition-all ${
                      revenueMin === p.min && revenueMax === p.max
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300/90"
                        : "border-white/8 bg-white/3 text-muted-foreground/50 hover:border-white/15"
                    }`}
                    data-testid={`button-preset-${p.label}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground/50 mb-1 block">Discover</label>
              <div className="flex gap-1">
                {[100, 500, 1000].map((count) => (
                  <Button
                    key={count}
                    variant="outline"
                    size="sm"
                    onClick={() => discoverMutation.mutate(count)}
                    disabled={!industry || isDiscovering || discoverMutation.isPending}
                    className="flex-1 text-[10px] h-8 border-amber-500/20 text-amber-300/70 hover:bg-amber-500/10 hover:text-amber-200 disabled:opacity-30"
                    data-testid={`button-discover-${count}`}
                  >
                    {count}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {isDiscovering && progress && (
            <div className="qi-panel rounded-lg p-3 border border-amber-500/20 bg-amber-500/5" data-testid="discovery-progress">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-[11px] text-amber-300/80">Discovering companies...</span>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                  {progress.companiesFound}/{progress.companiesTarget} found
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500/60 to-amber-400/40 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (progress.companiesFound / Math.max(1, progress.companiesTarget)) * 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground/40">
                <span>SIC codes: {progress.sicCodesProcessed}/{progress.sicCodesTotal}</span>
                <span>XBRL scanned: {progress.xbrlScanned}</span>
                {progress.currentCompany && <span className="truncate max-w-[200px]">Current: {progress.currentCompany}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {batches.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-muted-foreground/40" />
            <h4 className="text-[11px] font-semibold text-muted-foreground/50">PREVIOUS BATCHES</h4>
          </div>
          <div className="space-y-1.5">
            {batches.map((b: any) => (
              <button
                key={b.id}
                onClick={() => setActiveBatchId(activeBatchId === b.id ? null : b.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                  activeBatchId === b.id
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/5 bg-white/[0.015] hover:border-white/10"
                }`}
                data-testid={`batch-${b.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground/80">{b.name}</span>
                  <Badge variant="outline" className={`text-[8px] ${
                    b.status === "complete" ? "text-emerald-400 border-emerald-500/20" :
                    b.status === "error" ? "text-rose-400 border-rose-500/20" :
                    b.status === "discovering" || b.status === "scanning" || b.status === "analyzing" ? "text-amber-400 border-amber-500/20" :
                    "text-muted-foreground/40 border-white/10"
                  }`} data-testid={`batch-status-${b.id}`}>
                    {b.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground/40 ml-auto">{b.companyCount} companies</span>
                  <span className="text-[10px] text-muted-foreground/30">{b.industry}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeBatchId && batchDetail?.companies?.length > 0 && (
        <div className="space-y-2" data-testid="batch-companies">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-emerald-400/60" />
            <h4 className="text-[11px] font-semibold text-emerald-300/60">{batchDetail.batch.name} — {batchDetail.companies.length} COMPANIES</h4>
          </div>
          <div className="space-y-1">
            {batchDetail.companies.slice(0, 50).map((co: any, i: number) => (
              <div key={co.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.015] border border-white/5" data-testid={`company-row-${i}`}>
                <div className="w-5 text-[10px] text-muted-foreground/30 font-mono">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground/80 truncate">{co.companyName}</div>
                  <div className="text-[10px] text-muted-foreground/40">{co.sicDescription || co.sic}</div>
                </div>
                <div className="text-xs font-mono text-emerald-400/70">{formatValue(co.revenue)}</div>
                {co.state && <div className="text-[9px] text-amber-400/50 font-mono">{co.state}</div>}
              </div>
            ))}
            {batchDetail.companies.length > 50 && (
              <div className="text-center text-[10px] text-muted-foreground/30 py-1">
                + {batchDetail.companies.length - 50} more companies
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IntelligencePipelineContent() {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const batchesQuery = useQuery<any[]>({ queryKey: ["/api/discovery/batches"] });
  const sourcesQuery = useQuery<any[]>({ queryKey: ["/api/discovery/sources"] });
  const statusQuery = useQuery<any>({
    queryKey: ["/api/discovery/status"],
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return (data?.phase === "scanning" || data?.phase === "analyzing") ? 1200 : false;
    },
  });
  const batchDetailQuery = useQuery<any>({
    queryKey: ["/api/discovery/batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/discovery/batches/${selectedBatchId}/scan`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/status"] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/discovery/batches/${selectedBatchId}/analyze`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/batches"] });
    },
  });

  const batches = batchesQuery.data || [];
  const sources = sourcesQuery.data || [];
  const progress = statusQuery.data;
  const isScanning = progress?.phase === "scanning";
  const isAnalyzing = progress?.phase === "analyzing";
  const batchDetail = batchDetailQuery.data;
  const hasScannedCompanies = batchDetail?.companies?.some((c: any) => c.intelligenceData);

  const sourceResults = progress?.scanProgress?.sourceResults || {};
  const successCount = Object.values(sourceResults).filter((s: any) => s.status === "success" || s.count > 0).length;
  const noDataCount = Object.values(sourceResults).filter((s: any) => s.status === "no_data").length;
  const errorCount = Object.values(sourceResults).filter((s: any) => s.status === "error").length;
  const pendingCount = Object.values(sourceResults).filter((s: any) => s.status === "pending").length;

  useEffect(() => {
    if (progress?.phase === "idle" && (progress?.scanProgress?.companiesScanned > 0 || progress?.analyzeProgress?.companiesAnalyzed > 0)) {
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/batches", selectedBatchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/batches"] });
    }
  }, [progress?.phase]);

  return (
    <div className="space-y-4" data-testid="intelligence-pipeline">
      <div className="qi-panel rounded-xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ background: "radial-gradient(ellipse at 70% 30%, rgba(6,182,212,0.2) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Scan className="w-4 h-4 text-cyan-400/70" />
            <h3 className="text-xs font-semibold text-cyan-300/80" data-testid="text-pipeline-title">INTELLIGENCE PIPELINE</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground/50 mb-1 block">Select Batch</label>
              <select
                value={selectedBatchId || ""}
                onChange={(e) => setSelectedBatchId(e.target.value || null)}
                className="w-full h-8 px-2 text-xs bg-white/5 border border-white/10 rounded-lg text-foreground/80 focus:border-cyan-500/30 focus:outline-none"
                data-testid="select-batch-pipeline"
              >
                <option value="">Select a batch...</option>
                {batches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.companyCount} companies)</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => scanMutation.mutate()}
                disabled={!selectedBatchId || isScanning || isAnalyzing || scanMutation.isPending}
                className="text-[10px] h-8 border-cyan-500/20 text-cyan-300/70 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-30"
                data-testid="button-scan-intelligence"
              >
                <Scan className="w-3 h-3 mr-1" />
                Scan Intelligence
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyzeMutation.mutate()}
                disabled={!selectedBatchId || !hasScannedCompanies || isScanning || isAnalyzing || analyzeMutation.isPending}
                className="text-[10px] h-8 border-emerald-500/20 text-emerald-300/70 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-30"
                data-testid="button-analyze-credits"
              >
                <Beaker className="w-3 h-3 mr-1" />
                Analyze Credits
              </Button>
            </div>
          </div>

          {isScanning && progress.scanProgress && (
            <div className="qi-panel rounded-lg p-3 border border-cyan-500/20 bg-cyan-500/5" data-testid="scan-progress">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                <span className="text-[11px] text-cyan-300/80">Scanning intelligence sources...</span>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                  {progress.scanProgress.companiesScanned}/{progress.scanProgress.companiesTotal} companies
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500/60 to-cyan-400/40 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (progress.scanProgress.companiesScanned / Math.max(1, progress.scanProgress.companiesTotal)) * 100)}%` }}
                />
              </div>
              {progress.scanProgress.currentCompany && (
                <div className="text-[9px] text-muted-foreground/40 truncate">Current: {progress.scanProgress.currentCompany}</div>
              )}
            </div>
          )}

          {isAnalyzing && progress.analyzeProgress && (
            <div className="qi-panel rounded-lg p-3 border border-emerald-500/20 bg-emerald-500/5" data-testid="analyze-progress">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                <span className="text-[11px] text-emerald-300/80">Analyzing credit eligibility...</span>
                <span className="text-[10px] text-muted-foreground/40 ml-auto">
                  {progress.analyzeProgress.companiesAnalyzed}/{progress.analyzeProgress.companiesTotal}
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/40 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (progress.analyzeProgress.companiesAnalyzed / Math.max(1, progress.analyzeProgress.companiesTotal)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {sources.length > 0 && (isScanning || hasScannedCompanies || Object.keys(sourceResults).length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-3.5 h-3.5 text-cyan-400/50" />
            <h4 className="text-[11px] font-semibold text-cyan-300/60">INTELLIGENCE SOURCES ({sources.length} sources)</h4>
            {(successCount > 0 || noDataCount > 0 || errorCount > 0) && (
              <div className="ml-auto flex items-center gap-2 text-[9px]">
                <span className="text-emerald-400/70">{successCount} found</span>
                <span className="text-muted-foreground/40">{noDataCount} no data</span>
                {errorCount > 0 && <span className="text-rose-400/70">{errorCount} failed</span>}
                {pendingCount > 0 && <span className="text-amber-400/50">{pendingCount} scanning...</span>}
              </div>
            )}
            {sources.some((s: any) => s.requiresKey && !s.hasKey) && (
              <div className="flex items-center gap-1 text-[9px] text-amber-400/60" data-testid="text-key-needed-indicator">
                <KeyRound className="w-2.5 h-2.5" />
                <span>Requires API key</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1.5" data-testid="source-grid">
            {sources.map((src: any) => {
              const result = sourceResults[src.id];
              const hasData = result && result.count > 0;
              const isError = result?.status === "error";
              const isNoData = result?.status === "no_data";
              const isPending = !result || result.status === "pending";
              return (
                <div
                  key={src.id}
                  className={`qi-panel rounded-lg px-2 py-2 border transition-all duration-300 ${
                    hasData ? "border-emerald-500/25 bg-emerald-500/5" :
                    isError ? "border-rose-500/20 bg-rose-500/5" :
                    isNoData ? "border-white/8 bg-white/[0.01]" :
                    isPending && isScanning ? "border-amber-500/15 bg-amber-500/3" :
                    "border-white/5 bg-white/[0.01]"
                  }`}
                  data-testid={`source-card-${src.id}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {hasData ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" /> :
                     isError ? <XCircle className="w-3 h-3 text-rose-400/70 flex-shrink-0" /> :
                     isNoData ? <Circle className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" /> :
                     isPending && isScanning ? <Loader2 className="w-3 h-3 text-amber-400/50 animate-spin flex-shrink-0" /> :
                     <Circle className="w-3 h-3 text-white/10 flex-shrink-0" />
                    }
                    <span className={`text-[9px] font-medium truncate ${
                      hasData ? "text-emerald-300/80" :
                      isError ? "text-rose-300/60" :
                      "text-muted-foreground/50"
                    }`}>{src.name}</span>
                    {src.requiresKey && !src.hasKey && (
                      <KeyRound className="w-2.5 h-2.5 text-amber-400/60 flex-shrink-0 ml-auto" data-testid={`icon-key-needed-${src.id}`} />
                    )}
                  </div>
                  <div className="flex items-center gap-1 pl-4.5">
                    {result?.responseTimeMs > 0 && (
                      <span className="text-[8px] text-muted-foreground/30 font-mono">{result.responseTimeMs}ms</span>
                    )}
                    {hasData && result.count > 0 && (
                      <span className="text-[8px] text-emerald-400/50 font-mono ml-auto">{result.count} hits</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const CREDIT_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  filed: { label: "Filed", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  likely_eligible: { label: "Eligible — Not Filed", className: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  potential_opportunity: { label: "Opportunity", className: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  not_applicable: { label: "N/A", className: "text-muted-foreground/40 bg-white/5 border-white/10" },
  insufficient_data: { label: "No Data", className: "text-muted-foreground/30 bg-white/3 border-white/8" },
};

function ResultsContent() {
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const batchesQuery = useQuery<any[]>({ queryKey: ["/api/discovery/batches"] });
  const batchDetailQuery = useQuery<any>({
    queryKey: ["/api/discovery/batches", selectedBatchId],
    enabled: !!selectedBatchId,
  });

  const batches = (batchesQuery.data || []).filter((b: any) => b.status === "complete");
  const batchDetail = batchDetailQuery.data;
  const companies = batchDetail?.companies || [];
  const analyzedCompanies = companies.filter((c: any) => c.analysisResults);

  const ALL_CREDITS = [
    { key: "rd_credit", label: "R&D", section: "§41" },
    { key: "tariff_credit", label: "Tariff", section: "Duty" },
    { key: "wotc", label: "WOTC", section: "§51" },
    { key: "bonus_depreciation", label: "Bonus Depr.", section: "§168k" },
    { key: "sec179", label: "§179", section: "§179" },
    { key: "qsbs", label: "QSBS", section: "§1202" },
    { key: "erc", label: "ERC", section: "§3134" },
    { key: "opportunity_zones", label: "Opp. Zones", section: "§1400Z" },
    { key: "paid_leave", label: "Paid Leave", section: "§45S" },
    { key: "childcare", label: "Childcare", section: "§45F" },
  ];

  const stats = useMemo(() => {
    if (analyzedCompanies.length === 0) return { total: 0, eligible: 0, filed: 0, opportunities: 0, totalEstimated: 0, perCredit: {} as Record<string, number> };
    let eligible = 0, filed = 0, opportunities = 0, totalEstimated = 0;
    const perCredit: Record<string, number> = {};
    for (const credit of ALL_CREDITS) {
      perCredit[credit.key] = 0;
    }
    for (const co of analyzedCompanies) {
      for (const credit of ALL_CREDITS) {
        const result = co.analysisResults?.[credit.key];
        if (!result) continue;
        if (result.status === "filed") { filed++; perCredit[credit.key]++; }
        if (result.status === "likely_eligible") { eligible++; perCredit[credit.key]++; totalEstimated += result.estimatedValue || 0; }
        if (result.status === "potential_opportunity") { opportunities++; perCredit[credit.key]++; totalEstimated += result.estimatedValue || 0; }
      }
    }
    return { total: analyzedCompanies.length, eligible, filed, opportunities, totalEstimated, perCredit };
  }, [analyzedCompanies]);

  return (
    <div className="space-y-4" data-testid="results-content">
      <div className="qi-panel rounded-xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.2) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-emerald-400/70" />
            <h3 className="text-xs font-semibold text-emerald-300/80" data-testid="text-results-title">CREDIT ANALYSIS RESULTS</h3>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground/50 mb-1 block">Select Completed Batch</label>
              <select
                value={selectedBatchId || ""}
                onChange={(e) => { setSelectedBatchId(e.target.value || null); setExpandedCompany(null); }}
                className="w-full h-8 px-2 text-xs bg-white/5 border border-white/10 rounded-lg text-foreground/80 focus:border-emerald-500/30 focus:outline-none"
                data-testid="select-batch-results"
              >
                <option value="">Select a batch...</option>
                {batches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.companyCount} companies)</option>
                ))}
              </select>
            </div>
          </div>

          {selectedBatchId && stats.total > 0 && (
            <div className="grid grid-cols-4 gap-2" data-testid="results-stats">
              <div className="qi-panel rounded-lg p-2 text-center border border-white/5">
                <div className="text-lg font-bold text-foreground/80">{stats.total}</div>
                <div className="text-[9px] text-muted-foreground/40">Analyzed</div>
              </div>
              <div className="qi-panel rounded-lg p-2 text-center border border-amber-500/15">
                <div className="text-lg font-bold text-amber-400">{stats.eligible}</div>
                <div className="text-[9px] text-amber-300/50">Eligible</div>
              </div>
              <div className="qi-panel rounded-lg p-2 text-center border border-cyan-500/15">
                <div className="text-lg font-bold text-cyan-400">{stats.opportunities}</div>
                <div className="text-[9px] text-cyan-300/50">Opportunities</div>
              </div>
              <div className="qi-panel rounded-lg p-2 text-center border border-emerald-500/15">
                <div className="text-lg font-bold text-emerald-400">{formatValue(stats.totalEstimated)}</div>
                <div className="text-[9px] text-emerald-300/50">Est. Value</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedBatchId && analyzedCompanies.length > 0 && (
        <div className="space-y-1" data-testid="results-company-list">
          {analyzedCompanies.map((co: any, i: number) => {
            const isExpanded = expandedCompany === co.id;
            const creditResults = ALL_CREDITS.map(c => ({
              ...c,
              result: co.analysisResults?.[c.key],
              style: CREDIT_STATUS_STYLES[co.analysisResults?.[c.key]?.status] || CREDIT_STATUS_STYLES.insufficient_data,
            }));
            const totalEst = creditResults.reduce((sum, c) => sum + (c.result?.estimatedValue || 0), 0);
            const activeCredits = creditResults.filter(c => c.result?.status === "filed" || c.result?.status === "likely_eligible" || c.result?.status === "potential_opportunity");

            return (
              <div key={co.id} data-testid={`result-row-${i}`}>
                <button
                  onClick={() => setExpandedCompany(isExpanded ? null : co.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    isExpanded ? "border-emerald-500/20 bg-emerald-500/3" : "border-white/5 bg-white/[0.015] hover:border-white/10"
                  }`}
                  data-testid={`button-expand-${i}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-5 text-[10px] text-muted-foreground/30 font-mono flex-shrink-0">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground/80 truncate">{co.companyName}</div>
                      <div className="text-[10px] text-muted-foreground/40">{co.sicDescription || co.sic}</div>
                    </div>
                    <div className="text-xs font-mono text-foreground/50 flex-shrink-0">{formatValue(co.revenue)}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {creditResults.map(c => {
                        const s = c.result?.status;
                        const dotColor = s === "filed" ? "bg-emerald-400" : s === "likely_eligible" ? "bg-amber-400" : s === "potential_opportunity" ? "bg-amber-400/60" : s === "not_applicable" ? "bg-muted-foreground/20" : "bg-muted-foreground/10";
                        return (
                          <div key={c.key} className="flex flex-col items-center" title={`${c.label}: ${c.style.label}`} data-testid={`dot-${c.key}-${i}`}>
                            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                          </div>
                        );
                      })}
                    </div>
                    {totalEst > 0 && (
                      <span className="text-[10px] font-mono text-emerald-400/70 flex-shrink-0">{formatValue(totalEst)}</span>
                    )}
                    <Badge variant="outline" className="text-[8px] flex-shrink-0 text-foreground/50 bg-white/5 border-white/10" data-testid={`badge-credits-${i}`}>
                      {activeCredits.length}/10
                    </Badge>
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="ml-8 mr-3 mt-1 mb-2 space-y-1.5 text-[10px]" data-testid={`evidence-${i}`}>
                    <div className="grid grid-cols-5 gap-1.5">
                      {creditResults.map(c => {
                        const result = c.result;
                        if (!result) return null;
                        const borderColor = result.status === "filed" ? "border-emerald-500/20" : result.status === "likely_eligible" ? "border-amber-500/20" : result.status === "potential_opportunity" ? "border-amber-500/15" : "border-white/5";
                        const labelColor = result.status === "filed" ? "text-emerald-300/70" : result.status === "likely_eligible" ? "text-amber-300/70" : result.status === "potential_opportunity" ? "text-amber-300/60" : "text-muted-foreground/40";
                        return (
                          <div key={c.key} className={`qi-panel rounded-lg p-2 border ${borderColor}`} data-testid={`credit-cell-${c.key}-${i}`}>
                            <div className={`font-semibold ${labelColor} mb-0.5 truncate`}>{c.label} ({c.section})</div>
                            <Badge variant="outline" className={`text-[7px] mb-1 ${c.style.className}`}>{c.style.label}</Badge>
                            <div className="text-muted-foreground/50 leading-relaxed line-clamp-2">{result.evidence}</div>
                            {result.estimatedValue ? <div className="text-emerald-400/70 mt-0.5 font-mono">{formatValue(result.estimatedValue)}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedBatchId && analyzedCompanies.length === 0 && (
        <div className="text-center py-12 relative" data-testid="results-empty">
          <div className="w-24 h-24 mx-auto mb-4 opacity-[0.15] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(245,158,11,0.1) 40%, transparent 70%)" }}
          />
          <p className="text-sm text-muted-foreground/40">No analysis results yet</p>
          <p className="text-[11px] text-muted-foreground/30 mt-1">Go to Intelligence Pipeline to scan and analyze this batch</p>
        </div>
      )}
    </div>
  );
}

const CONFIDENCE_BADGE: Record<string, { label: string; className: string }> = {
  xbrl_verified: { label: "XBRL Verified", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  inferred: { label: "Inferred", className: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  estimated_by_industry: { label: "Estimated", className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
};

const NEGLECT_COLOR: Record<string, string> = {
  critical: "text-rose-400",
  high: "text-amber-400",
  moderate: "text-yellow-400",
  low: "text-emerald-400",
};

function PriorityTargets({ targets, isLoading }: { targets: any[]; isLoading: boolean }) {
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;
  if (!targets || targets.length === 0) return null;

  return (
    <div className="qi-panel p-3 rounded-xl relative overflow-hidden" data-testid="priority-targets">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.15) 0%, transparent 70%)" }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2.5">
          <Target className="w-3.5 h-3.5 text-emerald-400" style={{ animation: "breathe 3s ease-in-out infinite" }} />
          <h3 className="text-xs font-semibold text-emerald-300/80" data-testid="text-priority-targets-title">PRIORITY TARGETS</h3>
          <div className="ml-auto text-[10px] text-muted-foreground/40">{targets.length} companies</div>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {targets.map((t: any, i: number) => (
            <button
              key={t.companyName}
              onClick={() => setExpandedCompany(expandedCompany === t.companyName ? null : t.companyName)}
              className={`flex-shrink-0 qi-panel rounded-lg p-2.5 min-w-[200px] max-w-[260px] border transition-all duration-300 text-left group qi-stagger-${Math.min(i + 1, 4)} ${
                expandedCompany === t.companyName ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/5 hover:border-emerald-500/20"
              }`}
              style={{ perspective: "800px", background: expandedCompany !== t.companyName ? "linear-gradient(135deg, rgba(16,185,129,0.08), transparent)" : undefined }}
              data-testid={`priority-target-${i}`}
            >
              <div className="text-[11px] font-medium text-foreground/80 truncate mb-1 group-hover:text-foreground/95 transition-colors">
                {t.companyName}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-400/80">{formatValue(t.totalEstimatedValue)}</span>
                <span className="text-[10px] text-rose-400/60">{t.unclaimedCreditCount} unclaimed</span>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {t.companySize && (
                  <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${
                    t.companySize === "mid_size" ? "bg-emerald-500/15 text-emerald-400/80 border border-emerald-500/20" :
                    t.companySize === "large" ? "bg-blue-500/10 text-blue-400/60" :
                    t.companySize === "micro" ? "bg-amber-500/10 text-amber-400/60" :
                    "bg-white/5 text-muted-foreground/40"
                  }`} data-testid={`size-badge-${t.companyName}`}>
                    {t.companySize === "mid_size" ? "MID-SIZE" : t.companySize?.toUpperCase() || ""}
                  </span>
                )}
                {t.companyIndustry && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/50 truncate max-w-[100px]">{t.companyIndustry}</span>
                )}
                {t.companyState && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/60 font-mono">{t.companyState}</span>
                )}
                <Badge variant="outline" className={`text-[8px] ml-auto ${CONFIDENCE_BADGE[t.confidence]?.className || "text-muted-foreground border-white/10"}`}>
                  {CONFIDENCE_BADGE[t.confidence]?.label || t.confidence}
                </Badge>
              </div>
              {expandedCompany === t.companyName && t.topCredits && (
                <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                  {t.topCredits.map((c: string) => (
                    <div key={c} className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <AlertTriangle className="w-2.5 h-2.5 text-rose-400/50" />
                      {c.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GapMatrixContent({ onViewXRay }: { onViewXRay?: (leadId: string) => void }) {
  const { toast } = useToast();
  const matrixQuery = useQuery<any>({ queryKey: ["/api/credits/gap-matrix"] });
  const rulesQuery = useQuery<any[]>({ queryKey: ["/api/credits/rules"] });
  const [expandedCredit, setExpandedCredit] = useState<string | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);

  const gapDetailQuery = useQuery<any[]>({
    queryKey: ["/api/credits/gaps", expandedCredit],
    enabled: !!expandedCredit,
  });

  const bloomStatusQuery = useQuery<any>({
    queryKey: ["/api/light/mass-bloom/status"],
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === "running" ? 3000 : false;
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/credits/scan");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Gap Scan Complete", description: `Scanned ${data.scanned} companies, found ${data.gaps} gaps` });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/credits") });
    },
    onError: (err: any) => toast({ title: "Scan Error", description: err.message, variant: "destructive" }),
  });

  const bloomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/light/mass-bloom");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Industry Sweep Started", description: "Discovering tax credit opportunities across industries..." });
      queryClient.invalidateQueries({ queryKey: ["/api/light/mass-bloom/status"] });
    },
    onError: (err: any) => toast({ title: "Industry Sweep Error", description: err.message, variant: "destructive" }),
  });

  const matrixData = matrixQuery.data;
  const matrix = matrixData?.matrix || matrixData || [];
  const pipelineStats = matrixData?.pipelineStats;
  const totalGaps = Array.isArray(matrix) ? matrix.reduce((sum: number, m: any) => sum + m.gapCount, 0) : 0;
  const totalUnclaimed = Array.isArray(matrix) ? matrix.reduce((sum: number, m: any) => sum + m.totalUnclaimed, 0) : 0;
  const bloomStatus = bloomStatusQuery.data;
  const isBloomRunning = bloomStatus?.status === "running";

  if (matrixQuery.isLoading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;

  return (
    <div className="space-y-3" data-testid="gap-matrix-content">
      {isBloomRunning && (
        <div className="qi-panel p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5" data-testid="mass-bloom-progress">
          <div className="flex items-center gap-2 mb-2">
            <Sprout className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-300/80">Industry Sweep In Progress</span>
            <span className="text-[10px] text-muted-foreground/40 ml-auto">{bloomStatus.sicCodesProcessed}/{bloomStatus.sicCodesTotal} SIC codes</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div><span className="text-muted-foreground/40">Found:</span> <span className="text-emerald-400 font-bold">{bloomStatus.companiesFound?.toLocaleString()}</span></div>
            <div><span className="text-muted-foreground/40">New:</span> <span className="text-cyan-400 font-bold">{bloomStatus.companiesNew?.toLocaleString()}</span></div>
            <div><span className="text-muted-foreground/40">XBRL:</span> <span className="text-amber-400 font-bold">{bloomStatus.xbrlEnriched}/{bloomStatus.xbrlScanned}</span></div>
            <div><span className="text-muted-foreground/40">Gaps:</span> <span className="text-rose-400 font-bold">{bloomStatus.gapsFound?.toLocaleString()}</span></div>
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500/50 transition-all duration-500" style={{ width: `${Math.round((bloomStatus.sicCodesProcessed / Math.max(bloomStatus.sicCodesTotal, 1)) * 100)}%` }} />
          </div>
        </div>
      )}

      {bloomStatus?.status === "complete" && bloomStatus.companiesNew > 0 && (
        <div className="qi-panel p-2 rounded-lg border border-emerald-500/10 text-[10px] text-muted-foreground/50" data-testid="mass-bloom-complete">
          Last sweep: <span className="text-emerald-400 font-bold">{bloomStatus.companiesNew.toLocaleString()}</span> new companies,{" "}
          <span className="text-cyan-400 font-bold">{bloomStatus.xbrlEnriched}</span> XBRL enriched{" "}
          ({bloomStatus.sizeBreakdown?.midSize || 0} mid-size, {bloomStatus.sizeBreakdown?.large || 0} large, {bloomStatus.sizeBreakdown?.micro || 0} micro)
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-[11px] text-muted-foreground/50">
            <span className="text-emerald-400 font-bold">{totalGaps}</span> gaps across <span className="text-amber-400 font-bold">{Array.isArray(matrix) ? matrix.length : 0}</span> credits
          </div>
          {pipelineStats && (
            <div className="text-[11px] text-muted-foreground/50">
              <span className="text-cyan-400 font-bold">{pipelineStats.totalCompanies.toLocaleString()}</span> companies across <span className="text-amber-400 font-bold">{pipelineStats.totalIndustries}</span> industries
            </div>
          )}
          {totalUnclaimed > 0 && (
            <div className="text-[11px] text-muted-foreground/50">
              Est. unclaimed: <span className="text-emerald-400 font-bold">{formatValue(totalUnclaimed)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => bloomMutation.mutate()}
            disabled={isBloomRunning || bloomMutation.isPending}
            className="h-7 text-[10px] border-emerald-500/20 text-emerald-300/70 hover:bg-emerald-500/10"
            data-testid="button-mass-bloom"
          >
            {isBloomRunning ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Sprout className="w-3 h-3 mr-1" />}
            Sweep Industries
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRuleForm(!showRuleForm)}
            className="h-7 text-[10px] border-cyan-500/20 text-cyan-300/70 hover:bg-cyan-500/10"
            data-testid="button-add-rule"
          >
            <Plus className="w-3 h-3 mr-1" />
            Custom Rule
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="h-7 text-[10px] border-emerald-500/20 text-emerald-300/70 hover:bg-emerald-500/10"
            data-testid="button-run-gap-scan"
          >
            {scanMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Scan className="w-3 h-3 mr-1" />}
            Scan Now
          </Button>
        </div>
      </div>

      {showRuleForm && <CustomRuleForm onClose={() => setShowRuleForm(false)} rules={rulesQuery.data || []} />}

      <div className="space-y-1" data-testid="gap-matrix-table">
        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">
          <div className="col-span-4">Credit</div>
          <div className="col-span-1 text-center">Gaps</div>
          <div className="col-span-2 text-right">Unclaimed</div>
          <div className="col-span-2">Top Industry</div>
          <div className="col-span-2">Confidence</div>
          <div className="col-span-1 text-center">Alerts</div>
        </div>

        {matrix.map((row: any) => {
          const isExpanded = expandedCredit === row.creditId;
          return (
            <div key={row.creditId} data-testid={`gap-row-${row.creditId}`}>
              <button
                onClick={() => setExpandedCredit(isExpanded ? null : row.creditId)}
                className={`w-full grid grid-cols-12 gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-300 ${
                  isExpanded ? "bg-emerald-500/5 border border-emerald-500/15" : "bg-white/[0.015] hover:bg-white/[0.04] border border-transparent hover:border-white/5"
                }`}
              >
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground/80 truncate flex items-center gap-1.5 flex-wrap">
                      {row.creditName}
                      {row.status === "sunset" && (
                        <Badge variant="outline" className="text-[8px] text-rose-400 border-rose-500/20 bg-rose-500/10 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-sunset-${row.creditId}`}>
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                          Sunset
                        </Badge>
                      )}
                      {row.status === "phasing_out" && (
                        <Badge variant="outline" className="text-[8px] text-amber-400 border-amber-500/20 bg-amber-500/10 no-default-hover-elevate no-default-active-elevate" data-testid={`badge-phasing-out-${row.creditId}`}>
                          <Clock className="w-2.5 h-2.5 mr-0.5" />
                          Phasing Out
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground/40">{row.section}</div>
                  </div>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <span className={`text-xs font-bold ${row.gapCount > 0 ? "text-rose-400" : "text-muted-foreground/30"}`}>{row.gapCount}</span>
                </div>
                <div className="col-span-2 flex items-center justify-end">
                  <span className={`text-xs font-mono ${row.totalUnclaimed > 0 ? "text-emerald-400/80" : "text-muted-foreground/30"}`}>
                    {row.totalUnclaimed > 0 ? formatValue(row.totalUnclaimed) : "—"}
                  </span>
                </div>
                <div className="col-span-2 flex items-center">
                  <span className="text-[10px] text-muted-foreground/50 truncate">
                    {row.topIndustries?.[0] || "—"}
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  {row.confidenceBreakdown?.verified > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{row.confidenceBreakdown.verified}</span>
                  )}
                  {row.confidenceBreakdown?.inferred > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">{row.confidenceBreakdown.inferred}</span>
                  )}
                  {row.confidenceBreakdown?.estimated > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{row.confidenceBreakdown.estimated}</span>
                  )}
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  {row.legislativeAlerts > 0 ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-bold">{row.legislativeAlerts}</span>
                  ) : (
                    <span className="text-muted-foreground/20">—</span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="ml-6 mr-2 mt-1 mb-2 space-y-1 qi-shift" data-testid={`gap-detail-${row.creditId}`}>
                  {gapDetailQuery.isLoading ? (
                    <div className="space-y-1">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
                  ) : (gapDetailQuery.data || []).length === 0 ? (
                    <div className="text-center py-4 text-[11px] text-muted-foreground/40">No company gaps detected for this credit yet</div>
                  ) : (
                    (gapDetailQuery.data || []).map((gap: any) => (
                      <div
                        key={gap.id}
                        className="flex items-center gap-3 px-3 py-2 rounded bg-white/[0.02] hover:bg-white/[0.04] transition-all border border-transparent hover:border-white/5"
                        data-testid={`gap-company-${gap.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-foreground/75 truncate">{gap.companyName}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {gap.companyIndustry && <span className="text-[9px] text-muted-foreground/40">{gap.companyIndustry}</span>}
                            {gap.companyState && <span className="text-[9px] font-mono text-muted-foreground/30">{gap.companyState}</span>}
                            {gap.companySic && <span className="text-[9px] text-muted-foreground/25">SIC: {gap.companySic}</span>}
                          </div>
                        </div>
                        <Badge variant="outline" className={`text-[8px] ${
                          gap.gapStatus === "confirmed_unclaimed" ? "text-rose-400 border-rose-500/20" :
                          gap.gapStatus === "likely_unclaimed" ? "text-amber-400 border-amber-500/20" :
                          "text-cyan-400 border-cyan-500/20"
                        }`}>
                          {gap.gapStatus.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className={`text-[8px] ${CONFIDENCE_BADGE[gap.confidence]?.className || ""}`}>
                          {CONFIDENCE_BADGE[gap.confidence]?.label || gap.confidence}
                        </Badge>
                        {gap.estimatedUnclaimedValue != null && gap.estimatedUnclaimedValue > 0 && (
                          <span className="text-[11px] font-mono font-bold text-emerald-400/70">{formatValue(gap.estimatedUnclaimedValue)}</span>
                        )}
                        {gap.leadId && (
                          <a
                            href={`/?tab=light-engine&lead=${gap.leadId}`}
                            className="text-[10px] text-violet-400/60 hover:text-violet-400 flex items-center gap-0.5 transition-colors flex-shrink-0"
                            data-testid={`link-xray-${gap.leadId}`}
                          >
                            <Eye className="w-3 h-3" />
                            X-Ray
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomRuleForm({ onClose, rules }: { onClose: () => void; rules: any[] }) {
  const { toast } = useToast();
  const [creditId, setCreditId] = useState("");
  const [ruleName, setRuleName] = useState("");
  const [field, setField] = useState("rdExpense");
  const [operator, setOperator] = useState("gt");
  const [value, setValue] = useState("");
  const [previewResult, setPreviewResult] = useState<{ matchCount: number; sampleCompanies: string[] } | null>(null);

  const registryQuery = useQuery<any[]>({ queryKey: ["/api/credits/registry"] });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/credits/rules/preview", {
        creditId,
        conditions: [{ field, operator, value: parseFloat(value) || value }],
      });
      return res.json();
    },
    onSuccess: (data) => setPreviewResult(data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/credits/rules", {
        creditId,
        ruleName,
        conditions: [{ field, operator, value: parseFloat(value) || value }],
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule Created", description: "Gap scan re-running with new rule applied" });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/credits") });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      await apiRequest("DELETE", `/api/credits/rules/${ruleId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/credits/rules"] });
      toast({ title: "Rule Deleted" });
    },
  });

  const FIELDS = [
    { value: "rdExpense", label: "R&D Expense" },
    { value: "rdIntensity", label: "R&D Intensity" },
    { value: "effectiveRate", label: "Effective Tax Rate" },
    { value: "employeeCount", label: "Employee Count" },
    { value: "capex", label: "Capital Expenditures" },
    { value: "nolCarryforward", label: "NOL Carryforward" },
    { value: "totalAssets", label: "Total Assets" },
    { value: "totalRevenue", label: "Total Revenue" },
    { value: "ppeNet", label: "PP&E Net" },
    { value: "industryCategory", label: "Industry Category" },
  ];

  return (
    <div className="qi-panel p-3 rounded-lg border border-cyan-500/15 space-y-3" data-testid="custom-rule-form">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-cyan-300/80">Custom Fingerprint Rules</h4>
        <button onClick={onClose} className="p-1 hover:bg-white/5 rounded"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
      </div>

      {rules.length > 0 && (
        <div className="space-y-1 mb-2">
          <div className="text-[10px] text-muted-foreground/40 font-semibold">ACTIVE RULES</div>
          {rules.map((r: any) => (
            <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02] text-[11px]" data-testid={`rule-${r.id}`}>
              <FileText className="w-3 h-3 text-cyan-400/50" />
              <span className="flex-1 text-foreground/70">{r.ruleName}</span>
              <span className="text-[10px] text-muted-foreground/40">{r.creditId}</span>
              <button onClick={() => deleteRuleMutation.mutate(r.id)} className="p-0.5 hover:bg-rose-500/10 rounded" data-testid={`button-delete-rule-${r.id}`}>
                <Trash2 className="w-3 h-3 text-rose-400/50 hover:text-rose-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground/40 mb-1 block">Credit</label>
          <select
            value={creditId}
            onChange={(e) => setCreditId(e.target.value)}
            className="w-full h-7 text-[11px] bg-white/5 border border-white/10 rounded px-2 text-foreground/80"
            data-testid="select-credit"
          >
            <option value="">Select credit...</option>
            {(registryQuery.data || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground/40 mb-1 block">Rule Name</label>
          <Input
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            className="h-7 text-[11px] bg-white/5 border-white/10"
            placeholder="My custom rule"
            data-testid="input-rule-name"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground/40 mb-1 block">Field</label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full h-7 text-[11px] bg-white/5 border border-white/10 rounded px-2 text-foreground/80"
            data-testid="select-field"
          >
            {FIELDS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground/40 mb-1 block">Operator</label>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="w-full h-7 text-[11px] bg-white/5 border border-white/10 rounded px-2 text-foreground/80"
            data-testid="select-operator"
          >
            <option value="gt">Greater than</option>
            <option value="lt">Less than</option>
            <option value="eq">Equals</option>
            <option value="gte">Greater or equal</option>
            <option value="lte">Less or equal</option>
            <option value="contains">Contains</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground/40 mb-1 block">Value</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 text-[11px] bg-white/5 border-white/10"
            placeholder="100000"
            data-testid="input-rule-value"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => previewMutation.mutate()}
          disabled={!creditId || !value || previewMutation.isPending}
          className="h-7 text-[10px] border-amber-500/20 text-amber-300/70 hover:bg-amber-500/10"
          data-testid="button-preview-rule"
        >
          {previewMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={!creditId || !ruleName || !value || saveMutation.isPending}
          className="h-7 text-[10px] border-emerald-500/20 text-emerald-300/70 hover:bg-emerald-500/10"
          data-testid="button-save-rule"
        >
          {saveMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
          Save & Apply
        </Button>

        {previewResult && (
          <div className="flex-1 text-right">
            <span className="text-[11px] text-amber-300/70">
              This rule would flag <span className="font-bold text-amber-400">{previewResult.matchCount}</span> companies
            </span>
            {previewResult.sampleCompanies.length > 0 && (
              <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                e.g. {previewResult.sampleCompanies.slice(0, 3).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LegislativeTriggersContent() {
  const alertsQuery = useQuery<any[]>({ queryKey: ["/api/credits/legislative-alerts"] });

  if (alertsQuery.isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;

  const alerts = alertsQuery.data || [];

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12 relative" data-testid="legislative-empty">
        <div className="w-24 h-24 mx-auto mb-4 opacity-[0.15] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(245,158,11,0.1) 40%, transparent 70%)", animation: "coreGlow 4s ease-in-out infinite" }}
        />
        <p className="text-sm text-muted-foreground/40">No legislative triggers mapped yet</p>
        <p className="text-[11px] text-muted-foreground/30 mt-1">Legislative events are mapped to credits during each scan cycle</p>
      </div>
    );
  }

  const IMPACT_BADGE: Record<string, { label: string; className: string; icon: any }> = {
    expanded_eligibility: { label: "Expanded", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: TrendingUp },
    new_credit: { label: "New Credit", className: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", icon: Sparkles },
    sunset_warning: { label: "Sunset", className: "text-rose-400 bg-rose-500/10 border-rose-500/20", icon: AlertTriangle },
    rate_change: { label: "Rate Change", className: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: TrendingDown },
  };

  return (
    <div className="space-y-2" data-testid="legislative-triggers-content">
      {alerts.map((alert: any) => {
        const impact = IMPACT_BADGE[alert.impactType] || IMPACT_BADGE.rate_change;
        const ImpactIcon = impact.icon;
        return (
          <div
            key={alert.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-white/[0.015] hover:bg-white/[0.04] transition-all duration-300 border border-transparent hover:border-white/5"
            data-testid={`legislative-alert-${alert.id}`}
          >
            <ImpactIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${impact.className.split(" ")[0]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground/80 leading-snug">{alert.eventTitle}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] text-violet-400/60">{alert.creditName}</span>
                <Badge variant="outline" className={`text-[8px] ${impact.className}`}>{impact.label}</Badge>
                <span className="text-[10px] text-muted-foreground/30">{alert.sourceType}</span>
                {alert.effectiveDate && (
                  <span className="text-[10px] text-muted-foreground/30">{formatDate(alert.effectiveDate)}</span>
                )}
              </div>
              {alert.affectedIndustries && alert.affectedIndustries.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {alert.affectedIndustries.slice(0, 3).map((ind: string) => (
                    <span key={ind} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground/40">{ind}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreditIntelligenceContent({ activeSub }: {
  activeSub: string | null;
}) {
  if (activeSub === "Company Discovery") {
    return <CompanyDiscoveryContent />;
  }
  if (activeSub === "Intelligence Pipeline") {
    return <IntelligencePipelineContent />;
  }
  if (activeSub === "Results") {
    return <ResultsContent />;
  }
  if (activeSub === "Legislative Triggers") {
    return <LegislativeTriggersContent />;
  }
  return <GapMatrixContent />;
}

const TABS = Object.values(DEAL_TAB_CATEGORIES);

export default function DealsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(0);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [showMarketData, setShowMarketData] = useState(false);

  const tabCategory = TABS[activeTab]?.name;
  const subCategories = TABS[activeTab]?.subs || [];
  const isConvergenceTab = tabCategory === "Credit Intelligence";

  const statsQuery = useQuery<any>({ queryKey: ["/api/deals/stats"] });
  const heatmapQuery = useQuery<any[]>({ queryKey: ["/api/deals/heatmap"] });
  const sourcesQuery = useQuery<any[]>({ queryKey: ["/api/deals/sources"] });
  const priorityTargetsQuery = useQuery<any[]>({ queryKey: ["/api/credits/priority-targets"], enabled: true });

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
        title: "All Sources Fetched",
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
        title: "Convergence Analysis Complete",
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
                Credit Scanner
              </h1>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Surface unclaimed tax credits across 38 IRC sections</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <Input
                placeholder="Search all signals..."
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
              Find Convergences
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
              Fetch All Sources
            </Button>
          </div>
        </div>

        <StatsBar stats={statsQuery.data} isLoading={statsQuery.isLoading} />

        <PriorityTargets
          targets={priorityTargetsQuery.data || []}
          isLoading={priorityTargetsQuery.isLoading}
        />

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
              const count = tab.name === "Credit Intelligence"
                ? (statsQuery.data?.totalGaps || 0)
                : (statsQuery.data?.eventsByTab?.[tab.name] || 0);
              const isActive = activeTab === i;
              const isRadar = tab.name === "Credit Intelligence";
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
                  ? `${statsQuery.data?.creditsTracked || 38} credits tracked`
                  : `${totalEvents} events`
                }
              </div>
            </div>

            {isConvergenceTab ? (
              <CreditIntelligenceContent
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
                <p className="text-[11px] text-muted-foreground/30 mt-1">Click "Fetch All Sources" to pull from all sources</p>
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

        <div className="qi-panel rounded-xl overflow-hidden" data-testid="market-intelligence-section">
          <button
            onClick={() => setShowMarketData(!showMarketData)}
            className="w-full flex items-center justify-between px-4 py-3 text-left transition-all duration-300 hover:bg-white/[0.02]"
            data-testid="button-toggle-market-data"
          >
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-muted-foreground/40" />
              <span className="text-xs font-semibold text-muted-foreground/50">MARKET SIGNALS</span>
              <span className="text-[10px] text-muted-foreground/30">Signal heatmap, source status, event filters</span>
            </div>
            {showMarketData ? <ChevronUp className="w-4 h-4 text-muted-foreground/30" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/30" />}
          </button>
          {showMarketData && (
            <div className="px-4 pb-4 space-y-4 qi-shift">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <HeatMap
                    stateData={heatmapQuery.data || []}
                    selectedState={selectedState}
                    onSelectState={setSelectedState}
                  />
                </div>
                <div className="space-y-3">
                  <div className="qi-panel p-3 rounded-lg relative overflow-hidden" data-testid="current-filters" style={{ perspective: "800px" }}>
                    <h4 className="text-[11px] font-semibold text-muted-foreground/60 mb-2 relative z-10">SIGNAL FILTERS</h4>
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
                    <h4 className="text-[11px] font-semibold text-muted-foreground/60 mb-2">SOURCE STATUS ({sourcesQuery.data?.length || 0})</h4>
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
                            Pull
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedEntityId && (
        <EntityPanel
          entityId={selectedEntityId}
          onClose={() => setSelectedEntityId(null)}
        />
      )}
    </div>
  );
}
