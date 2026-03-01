import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, ChevronRight, ChevronDown, Trash2, Loader2, Search,
  Coins, Sparkles, Radar, Activity,
  BarChart3, MapPin, TrendingUp, DollarSign, Users, Factory,
  FolderOpen, Layers, Brain, Target, Heart, Globe2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface PortfolioData {
  allocations: Array<{
    id: string;
    leadId: string;
    company: string;
    domain: string | null;
    allocatedAt: string;
    lead: {
      id: string;
      company: string;
      domain: string;
      sic: string;
      sicDescription: string;
      industryCategory: string;
      state: string;
      enrichmentData: any;
      pipelineStage: string;
      deepAnalysisComplete: boolean;
    };
  }>;
  groups: {
    byIndustry: Record<string, any[]>;
    byState: Record<string, any[]>;
    byHealth: Record<string, any[]>;
  };
  intelligence: {
    totalCompanies: number;
    totalUnclaimedValue: number;
    avgCreditHealth: number;
    industryCount: number;
    stateCount: number;
  };
}

function formatCurrency(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PortfolioPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<"industry" | "state" | "health">("industry");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const portfolioQuery = useQuery<PortfolioData>({ queryKey: ["/api/portfolio"] });

  const filteredAllocations = useMemo(() => {
    if (!portfolioQuery.data?.allocations) return [];
    if (!searchTerm) return portfolioQuery.data.allocations;
    const t = searchTerm.toLowerCase();
    return portfolioQuery.data.allocations.filter(a =>
      a.company.toLowerCase().includes(t) || a.domain?.toLowerCase().includes(t)
    );
  }, [portfolioQuery.data, searchTerm]);

  const groups = useMemo(() => {
    if (!portfolioQuery.data?.groups) return {};
    if (groupBy === "industry") return portfolioQuery.data.groups.byIndustry;
    if (groupBy === "state") return portfolioQuery.data.groups.byState;
    return portfolioQuery.data.groups.byHealth;
  }, [portfolioQuery.data, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const removeFromPortfolio = async (leadId: string) => {
    try {
      await apiRequest("DELETE", `/api/portfolio/${leadId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
      toast({ title: "Removed from portfolio" });
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    }
  };

  const intel = portfolioQuery.data?.intelligence;

  if (portfolioQuery.isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const isEmpty = !portfolioQuery.data?.allocations?.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-400/10 border border-emerald-400/15 flex items-center justify-center">
            <FolderOpen className="w-4.5 h-4.5 text-emerald-300/60" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground/90" data-testid="text-portfolio-title">Portfolio Dashboard</h1>
            <p className="text-xs text-muted-foreground/50">Companies allocated from the Light Engine pipeline</p>
          </div>
        </div>
        {intel && intel.totalCompanies > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground/40">
            <span>{intel.totalCompanies} companies</span>
            <span>{intel.industryCount} industries</span>
            <span>{intel.stateCount} states</span>
          </div>
        )}
      </div>

      {isEmpty && (
        <div className="py-16 text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-emerald-400/10 mx-auto" />
          <p className="text-sm text-muted-foreground/30">No companies in portfolio yet</p>
          <p className="text-xs text-muted-foreground/20">
            Use the Light Engine to discover, extrapolate, and analyze companies. Then allocate them here from Stage III.
          </p>
        </div>
      )}

      {!isEmpty && intel && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="section-portfolio-metrics">
            <div className="rounded-lg border border-emerald-500/10 bg-emerald-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/40">
                <DollarSign className="w-3 h-3" /> Total Unclaimed Value
              </div>
              <div className="text-lg font-bold text-emerald-200/80 tabular-nums" data-testid="text-total-unclaimed">
                {formatCurrency(intel.totalUnclaimedValue)}
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/10 bg-amber-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400/40">
                <Heart className="w-3 h-3" /> Avg Credit Health
              </div>
              <div className="text-lg font-bold text-amber-200/80 tabular-nums" data-testid="text-avg-health">
                {intel.avgCreditHealth}/100
              </div>
            </div>
            <div className="rounded-lg border border-cyan-500/10 bg-cyan-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/40">
                <Factory className="w-3 h-3" /> Industries
              </div>
              <div className="text-lg font-bold text-cyan-200/80 tabular-nums" data-testid="text-industry-count">
                {intel.industryCount}
              </div>
            </div>
            <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-4 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-violet-400/40">
                <MapPin className="w-3 h-3" /> Geographic Spread
              </div>
              <div className="text-lg font-bold text-violet-200/80 tabular-nums" data-testid="text-state-count">
                {intel.stateCount} states
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/25" />
              <Input placeholder="Search portfolio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-transparent border-emerald-500/10 focus:border-emerald-500/25 placeholder:text-muted-foreground/20"
                data-testid="input-search-portfolio" />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/30">
              <span>Group by:</span>
              <div className="flex items-center border border-emerald-500/10 rounded-md overflow-hidden">
                {(["industry", "health", "state"] as const).map(g => (
                  <button key={g} onClick={() => setGroupBy(g)} data-testid={`button-group-${g}`}
                    className={`px-2.5 py-1.5 text-xs transition-colors ${groupBy === g ? "bg-emerald-500/15 text-emerald-200" : "text-muted-foreground/30"}`}>
                    {g === "industry" ? "Industry" : g === "health" ? "Credit Health" : "State"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {searchTerm ? (
            <div className="space-y-2">
              {filteredAllocations.map(alloc => (
                <PortfolioCard key={alloc.id} alloc={alloc} expanded={expandedLead === alloc.leadId}
                  onToggle={() => setExpandedLead(expandedLead === alloc.leadId ? null : alloc.leadId)}
                  onRemove={() => removeFromPortfolio(alloc.leadId)} />
              ))}
              {filteredAllocations.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground/25">No companies match your search</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3" data-testid="section-portfolio-groups">
              {Object.entries(groups).sort((a, b) => b[1].length - a[1].length).map(([key, items]) => (
                <div key={key} className="rounded-lg border border-emerald-500/8 bg-card/30 overflow-hidden">
                  <button onClick={() => toggleGroup(key)} data-testid={`group-header-${key}`}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-500/3 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${
                        groupBy === "health"
                          ? key === "Desert" ? "bg-red-500/15 text-red-300/60"
                          : key === "Underexplored" ? "bg-amber-500/15 text-amber-300/60"
                          : key === "Partial" ? "bg-yellow-500/15 text-yellow-300/60"
                          : key === "Well-Managed" ? "bg-lime-500/15 text-lime-300/60"
                          : "bg-emerald-500/15 text-emerald-300/60"
                          : "bg-emerald-500/10 text-emerald-300/50"
                      }`}>
                        {items.length}
                      </div>
                      <span className="text-sm text-foreground/70 font-medium">{key}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {(() => {
                        let totalUnclaimed = 0;
                        for (const p of items) {
                          const position = p.lead?.enrichmentData?.creditPosition || {};
                          totalUnclaimed += position.estimatedUnclaimedValue || 0;
                        }
                        return totalUnclaimed > 0 ? (
                          <span className="text-[11px] text-emerald-300/40 tabular-nums">{formatCurrency(totalUnclaimed)}</span>
                        ) : null;
                      })()}
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/20 transition-transform ${expandedGroups.has(key) ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {expandedGroups.has(key) && (
                    <div className="border-t border-emerald-500/6 px-2 py-2 space-y-1.5">
                      {items.map((p: any) => (
                        <PortfolioCard key={p.id} alloc={p} expanded={expandedLead === p.leadId}
                          onToggle={() => setExpandedLead(expandedLead === p.leadId ? null : p.leadId)}
                          onRemove={() => removeFromPortfolio(p.leadId)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PortfolioCard({ alloc, expanded, onToggle, onRemove }: {
  alloc: any;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const lead = alloc.lead;
  if (!lead) return null;

  const enrichment = lead.enrichmentData || {};
  const position = enrichment.creditPosition || {};
  const healthScore = position.creditHealthScore || 0;
  const unclaimed = position.estimatedUnclaimedValue || 0;
  const creditAnalysis = enrichment.creditAnalysis || [];
  const forms = enrichment.discoveredForms || [];
  const adIntel = enrichment.adIntel || {};
  const retroRecovery = enrichment.retroactiveRecovery || [];

  return (
    <Card className={`transition-all cursor-pointer border bg-card/40 ${expanded ? "border-emerald-400/20 bg-card/60" : "border-emerald-500/8 hover:border-emerald-400/15"}`}
      onClick={onToggle} data-testid={`portfolio-card-${alloc.leadId}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Building2 className="w-4 h-4 shrink-0 text-emerald-300/50" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground/90 truncate">{lead.company}</span>
                {lead.state && <span className="text-[10px] text-muted-foreground/30">{lead.state}</span>}
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                {lead.domain && <span className="text-muted-foreground/30">{lead.domain}</span>}
                {lead.sicDescription && <span className="text-muted-foreground/20 truncate hidden sm:inline">{lead.sicDescription}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs">
            {healthScore > 0 && (
              <span className={`text-[10px] px-1.5 py-0 rounded font-medium tabular-nums ${
                healthScore <= 20 ? "text-amber-200 bg-amber-500/20" :
                healthScore <= 40 ? "text-amber-300/80 bg-amber-500/12" :
                healthScore <= 60 ? "text-yellow-300/70 bg-yellow-500/10" :
                healthScore <= 80 ? "text-lime-300/70 bg-lime-500/10" :
                "text-emerald-300/70 bg-emerald-500/10"
              }`} data-testid={`badge-health-${alloc.leadId}`}>
                {healthScore}
              </span>
            )}
            {unclaimed > 0 && (
              <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums" data-testid={`text-unclaimed-${alloc.leadId}`}>
                {formatCurrency(unclaimed)}
              </span>
            )}
            {creditAnalysis.length > 0 && (
              <span className="text-amber-400/50 flex items-center gap-0.5">
                <Coins className="w-2.5 h-2.5" /><span className="tabular-nums">{creditAnalysis.length}</span>
              </span>
            )}
            <button onClick={e => { e.stopPropagation(); onRemove(); }} data-testid={`button-remove-${alloc.leadId}`}
              className="text-red-400/20 hover:text-red-400/50 transition-colors p-1" title="Remove from portfolio">
              <Trash2 className="w-3 h-3" />
            </button>
            <ChevronRight className={`w-3.5 h-3.5 text-emerald-400/20 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-3" onClick={e => e.stopPropagation()}>
            {healthScore > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 rounded bg-emerald-950/5 border border-emerald-500/8">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                  healthScore <= 20 ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" :
                  healthScore <= 40 ? "bg-amber-500/12 text-amber-300/80" :
                  healthScore <= 60 ? "bg-yellow-500/10 text-yellow-300/70" :
                  healthScore <= 80 ? "bg-lime-500/10 text-lime-300/70" :
                  "bg-emerald-500/10 text-emerald-300/70"
                }`}>
                  {healthScore}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-medium text-emerald-300/60">
                    {healthScore <= 20 ? "Credit Desert" : healthScore <= 40 ? "Underexplored" : healthScore <= 60 ? "Partial Coverage" : healthScore <= 80 ? "Well Managed" : "Fully Optimized"}
                  </div>
                  {unclaimed > 0 && <div className="text-[10px] text-emerald-400/30">{formatCurrency(unclaimed)} estimated unclaimed</div>}
                </div>
                <div className="w-24 h-1.5 bg-emerald-950/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${
                    healthScore <= 20 ? "bg-amber-400/60" :
                    healthScore <= 40 ? "bg-amber-400/40" :
                    healthScore <= 60 ? "bg-yellow-400/40" :
                    healthScore <= 80 ? "bg-lime-400/40" :
                    "bg-emerald-400/40"
                  }`} style={{ width: `${healthScore}%` }} />
                </div>
              </div>
            )}

            {creditAnalysis.length > 0 && (
              <div className="rounded-lg border border-amber-500/8 bg-amber-950/3 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Coins className="w-3.5 h-3.5 text-amber-400/40" />
                  <span className="text-xs font-medium text-amber-300/50">Credit Analysis ({creditAnalysis.length})</span>
                </div>
                <div className="space-y-1">
                  {creditAnalysis.map((ca: any, i: number) => {
                    const statusColors: Record<string, string> = {
                      active: "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/8",
                      unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/10",
                      likely_unclaimed: "text-amber-300/70 border-amber-500/20 bg-amber-500/8",
                      partial: "text-yellow-300/70 border-yellow-500/20 bg-yellow-500/8",
                    };
                    return (
                      <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded border border-amber-500/5 bg-amber-950/3">
                        <Sparkles className={`w-3 h-3 shrink-0 ${ca.status === "unclaimed" || ca.status === "likely_unclaimed" ? "text-amber-300/60" : "text-emerald-400/40"}`} />
                        <span className="text-xs text-amber-200/60 font-medium flex-1 truncate">{ca.creditName}</span>
                        <span className="text-[10px] text-amber-400/30 font-mono">{ca.section}</span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusColors[ca.status] || "text-zinc-400/50 border-zinc-500/15"}`}>
                          {ca.status?.replace(/_/g, " ")}
                        </Badge>
                        {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/50 tabular-nums">{formatCurrency(ca.potentialAmount)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {retroRecovery.length > 0 && (
              <div className="rounded-lg border border-violet-500/10 bg-violet-950/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-violet-400/40" />
                  <span className="text-xs font-medium text-violet-300/50">Retroactive Recovery ({retroRecovery.length})</span>
                </div>
                <div className="space-y-1">
                  {retroRecovery.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded border border-violet-500/5 bg-violet-950/3 text-xs">
                      <span className="text-violet-200/60 font-medium flex-1 truncate">{r.creditName}</span>
                      <span className="text-violet-400/30">{r.lookbackYears}yr lookback</span>
                      <span className="text-violet-300/50 font-medium tabular-nums">{formatCurrency(r.totalRetroactive)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forms.length > 0 && (
              <div className="rounded-lg border border-amber-500/8 bg-amber-950/3 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-3.5 h-3.5 text-amber-400/40" />
                  <span className="text-xs font-medium text-amber-300/50">Discovered Forms ({forms.length})</span>
                </div>
                <div className="space-y-1">
                  {forms.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-1 px-3 rounded border border-amber-500/5 text-xs">
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/15 text-amber-300/50">{f.classification}</Badge>
                      <span className="text-amber-400/30 font-mono truncate flex-1">{f.action}</span>
                      <span className="text-amber-400/20">{f.fieldCount}f</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adIntel.adNetworks?.length > 0 && (
              <div className="rounded-lg border border-emerald-500/8 bg-emerald-950/3 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400/40" />
                  <span className="text-xs font-medium text-emerald-300/50">Ad Intelligence</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {adIntel.adNetworks.map((net: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[11px] px-2 py-0.5 border-emerald-500/15 text-emerald-300/50">{net}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-muted-foreground/20 px-1">
              <span>Allocated {new Date(alloc.allocatedAt).toLocaleDateString()}</span>
              <span>Pipeline: {lead.pipelineStage}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
