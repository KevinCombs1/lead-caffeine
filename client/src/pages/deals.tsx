import { useState, useMemo } from "react";
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
  Database, Target,
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

function ProbabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2" data-testid="probability-bar">
      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full qi-bar ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground font-mono">{pct}%</span>
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
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]">
        <Shape4DCanvas shapeKey="tesseract" autoRotate={true} scale={2.5} opacity={0.4} className="w-full h-full" showControls={false} />
      </div>

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

const TABS = Object.values(DEAL_TAB_CATEGORIES);

export default function DealsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(0);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState<string | null>(null);

  const tabCategory = TABS[activeTab]?.name;
  const subCategories = TABS[activeTab]?.subs || [];
  const activeShapeKey = TAB_SHAPES[tabCategory] || "orthoplex";

  const statsQuery = useQuery<any>({ queryKey: ["/api/deals/stats"] });
  const heatmapQuery = useQuery<any[]>({ queryKey: ["/api/deals/heatmap"] });
  const sourcesQuery = useQuery<any[]>({ queryKey: ["/api/deals/sources"] });

  const queryString = `?tabCategory=${encodeURIComponent(tabCategory)}${activeSub ? `&subCategory=${encodeURIComponent(activeSub)}` : ""}${selectedState ? `&state=${selectedState}` : ""}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}${currentFilter ? `&current=${currentFilter}` : ""}&limit=50`;
  const eventsQuery = useQuery<{ events: any[]; total: number }>({
    queryKey: [`/api/deals/events${queryString}`],
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

  return (
    <div className="min-h-screen bg-background relative" data-testid="deals-page">
      <div className="relative z-10 p-4 space-y-4">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 relative" style={{ perspective: "600px" }}>
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
              onClick={() => fetchAllMutation.mutate()}
              disabled={fetchAllMutation.isPending}
              className="h-8 text-[11px] border-amber-500/20 text-amber-300/70 hover:bg-amber-500/10 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)] transition-all"
              style={{ perspective: "800px" }}
              data-testid="button-compile-all"
            >
              {fetchAllMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5" />
              )}
              Compile All Data
            </Button>
          </div>
        </div>

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
                      className="text-[10px] text-amber-400/50 hover:text-amber-400 hover:shadow-[0_0_6px_rgba(245,158,11,0.2)] transition-all px-1.5 py-0.5 rounded"
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
          <div className="absolute top-2 right-2 w-16 h-16 pointer-events-none opacity-[0.08] z-0 transition-all duration-500">
            <Shape4DCanvas key={activeShapeKey} shapeKey={activeShapeKey} autoRotate={true} scale={1} opacity={0.5} className="w-full h-full" showControls={false} />
          </div>

          <div className="flex items-center gap-0.5 px-2 pt-2 overflow-x-auto scrollbar-hide border-b border-white/5 relative z-10">
            {TABS.map((tab, i) => {
              const Icon = TAB_ICONS[tab.name] || Activity;
              const count = statsQuery.data?.eventsByTab?.[tab.name] || 0;
              const isActive = activeTab === i;
              return (
                <button
                  key={tab.name}
                  onClick={() => { setActiveTab(i); setActiveSub(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-all duration-300 ${
                    isActive
                      ? "text-amber-300/90 bg-amber-500/8 border-b-2 border-amber-500/40"
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
                  <Icon className="w-3 h-3" />
                  {tab.name}
                  {count > 0 && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${
                      isActive ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-muted-foreground/40"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-3 relative z-10">
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
                {totalEvents} events
              </div>
            </div>

            {eventsQuery.isLoading ? (
              <div className="space-y-2" data-testid="events-loading">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 relative" data-testid="events-empty">
                <div className="w-24 h-24 mx-auto mb-4 opacity-[0.15]">
                  <Shape4DCanvas shapeKey="hypercone" autoRotate={true} scale={1.5} opacity={0.5} className="w-full h-full" showControls={false} />
                </div>
                <p className="text-sm text-muted-foreground/40">No events compiled yet</p>
                <p className="text-[11px] text-muted-foreground/30 mt-1">Click "Compile All Data" to fetch from all sources</p>
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
    </div>
  );
}
