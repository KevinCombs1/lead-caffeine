import { Separator } from "@/components/ui/separator";
import {
  ChevronRight, XCircle,
  Zap, Activity,
  Coins, Sparkles, Landmark,
  Briefcase, BarChart3, MapPin, TrendingUp, DollarSign, Users, FileText, Factory,
  Shield, Radar,
} from "lucide-react";
import { Shape4DCanvas } from "@/components/shapes-4d";
import type { LeadDelta } from "./types";

interface AggregateData {
  totalLeads: number;
  totalForms: number;
  totalFields: number;
  withForms: number;
  withoutForms: number;
  formTypeBreakdown: Record<string, number>;
  lightCycle: { composed: number; pushed: number; received: number };
  totalWithAds: number;
  totalAdNetworks: number;
  adNetworkCounts: Record<string, number>;
  avgCreditHealth: number;
  totalUnclaimedValue: number;
  leadsWithXray: number;
  leadsWithoutXbrl: number;
  revenueTiers: { micro: number; small: number; mid: number; large: number; enterprise: number };
  avgRdIntensity: number;
  totalNol: number;
  rateDistribution: { belowStatutory: number; atStatutory: number; aboveStatutory: number; negative: number; unknown: number };
  healthTiers: { creditDesert: number; underexplored: number; partialCoverage: number; wellManaged: number; fullyOptimized: number };
  creditStatusCounts: Record<string, { unclaimed: number; likely_unclaimed: number; active: number; partial: number; unknown: number }>;
  stateCounts: Record<string, { count: number; unclaimed: number }>;
  industryCounts: Record<string, { count: number; avgHealth: number; totalUnclaimed: number; healthSum: number; xrayCount: number }>;
  opportunityCounts: { high: number; moderate: number; low: number; unknown: number };
  entityTypeCounts: Record<string, number>;
  filingRecency: { current: number; recent: number; aging: number; stale: number; unknown: number };
  employeeRanges: { tiny: number; small: number; medium: number; large: number; enterprise: number };
  totalRevenue: number;
  totalRdExpense: number;
  totalEmployees: number;
}

export interface IntelFilter {
  healthTier?: string;
  rateTier?: string;
  revenueTier?: string;
  empTier?: string;
  state?: string;
  credit?: string;
  cluster?: string;
  entityType?: string;
  discoverySource?: string;
}

export interface IntelDashboardProps {
  agg: AggregateData;
  leads: LeadDelta[];
  allLeads: LeadDelta[];
  intelFilter: IntelFilter;
  setIntelFilter: React.Dispatch<React.SetStateAction<IntelFilter>>;
  intelTab: "overview" | "crossref" | "legislation" | "clusters";
  setIntelTab: React.Dispatch<React.SetStateAction<"overview" | "crossref" | "legislation" | "clusters">>;
  setExpandedId: (id: string | null) => void;
  credits: Array<{ id: string; name: string; section: string; description: string; maxValue: string; applicableCategories: string[]; neglectLevel: string }>;
}

function formatCurrency(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function IntelDashboard({ agg, leads, allLeads, intelFilter, setIntelFilter, intelTab, setIntelTab, setExpandedId, credits }: IntelDashboardProps) {
  return (
        <div className="rounded-xl border border-amber-400/12 bg-gradient-to-br from-amber-950/10 to-zinc-950/8 p-5 space-y-5" data-testid="section-quantum-intel"
          style={{ animation: "fadeSlideIn 0.4s ease-out both" }}>

          {Object.keys(intelFilter).some(k => (intelFilter as any)[k]) && (
            <div className="flex items-center gap-2.5 flex-wrap p-3 rounded-lg bg-amber-500/5 border border-amber-500/10" data-testid="intel-active-filters">
              <span className="text-xs font-medium text-amber-400/40">Filters:</span>
              {Object.entries(intelFilter).filter(([, v]) => v).map(([k, v]) => {
                const catColor = ["healthTier","rateTier","revenueTier"].includes(k) ? "bg-amber-500/15 border-amber-400/20 text-amber-200/60"
                  : ["empTier","entityType"].includes(k) ? "bg-emerald-500/12 border-emerald-400/18 text-emerald-200/60"
                  : k === "discoverySource" ? "bg-cyan-500/12 border-cyan-400/18 text-cyan-200/60"
                  : k === "credit" ? "bg-violet-500/12 border-violet-400/18 text-violet-200/60"
                  : "bg-amber-500/12 border-amber-400/18 text-amber-200/60";
                return (
                  <button key={k} onClick={() => setIntelFilter(prev => { const n = { ...prev }; delete (n as any)[k]; return n; })}
                    className={`qi-button inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-all ${catColor}`} data-testid={`filter-badge-${k}`}>
                    {k.replace(/([A-Z])/g, " $1").trim()}: {v} <XCircle className="w-3 h-3 opacity-50 hover:opacity-100" />
                  </button>
                );
              })}
              <button onClick={() => setIntelFilter({})}
                className="qi-button px-2.5 py-1 rounded-lg text-xs bg-zinc-800/40 border border-zinc-700/30 text-zinc-400/60 hover:text-zinc-300/80 hover:border-zinc-600/40 transition-all" data-testid="button-clear-filters">
                Clear All
              </button>
              <span className="text-xs text-amber-400/30 ml-auto tabular-nums font-medium" data-testid="text-filter-count">
                {leads.length} of {agg.totalLeads} leads
              </span>
            </div>
          )}

          <div className="flex items-center justify-center" style={{ animation: "fadeSlideIn 0.5s ease-out both" }}>
            <div className="relative flex flex-col items-center py-4 px-8" style={{ animation: "coreGlow 4s ease-in-out infinite" }}>
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/5 via-transparent to-amber-500/3" />
              <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.12 }}>
                <Shape4DCanvas
                  shapeKey="orthoplex"
                  autoRotate={true}
                  showControls={false}
                  scale={1.8}
                  opacity={0.6}
                  className="w-full h-full"
                />
              </div>
              <span className="text-[11px] uppercase tracking-widest text-amber-400/35 font-medium mb-1 relative z-10">Unclaimed Value</span>
              <span className="text-3xl font-bold text-amber-200/85 tabular-nums relative z-10" data-testid="stat-total-unclaimed-hero">
                {formatCurrency(agg.totalUnclaimedValue)}
              </span>
              <div className="flex items-center gap-4 mt-2 text-xs text-amber-400/35 relative z-10">
                <span className="tabular-nums">{agg.totalLeads} leads</span>
                <span className="text-amber-500/15">|</span>
                <span className="tabular-nums">{agg.leadsWithXray} x-rayed</span>
                <span className="text-amber-500/15">|</span>
                <span className="tabular-nums">avg health {agg.avgCreditHealth}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Revenue Pool", value: formatCurrency(agg.totalRevenue), sub: `${Object.values(agg.revenueTiers).reduce((s, v) => s + v, 0)} reporting`, icon: DollarSign, border: "border-amber-500/10", text: "text-amber-200/70", subText: "text-amber-400/25", stagger: "qi-stagger-1", testId: "stat-total-revenue" },
              { label: "R&D Spend", value: formatCurrency(agg.totalRdExpense), sub: `${agg.avgRdIntensity}% avg intensity`, icon: Sparkles, border: "border-cyan-500/10", text: "text-cyan-200/70", subText: "text-cyan-400/25", stagger: "qi-stagger-2", testId: "stat-total-rd" },
              { label: "Employees", value: agg.totalEmployees.toLocaleString(), sub: `${Object.values(agg.employeeRanges).reduce((s, v) => s + v, 0)} reporting`, icon: Users, border: "border-emerald-500/10", text: "text-emerald-200/70", subText: "text-emerald-400/25", stagger: "qi-stagger-3", testId: "stat-total-employees" },
              { label: "NOL Pool", value: formatCurrency(agg.totalNol), sub: "future tax shield", icon: TrendingUp, border: "border-violet-500/10", text: "text-violet-200/70", subText: "text-violet-400/25", stagger: "qi-stagger-4", testId: "stat-total-nol" },
            ].map(s => (
              <div key={s.label} className={`qi-panel ${s.stagger} p-3.5 space-y-1.5 ${s.border}`} data-testid={s.testId}>
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400/30 uppercase tracking-wider"><s.icon className="w-3.5 h-3.5" /> {s.label}</div>
                <div className={`text-lg font-semibold tabular-nums ${s.text}`}>{s.value}</div>
                <div className={`text-[11px] ${s.subText}`}>{s.sub}</div>
              </div>
            ))}
          </div>

          {(() => {
            const xrayLeads = allLeads.filter(l => l.xbrlDepth > 0);
            const rdNoCredit = xrayLeads.filter(l => (l.rdExpense || 0) > 0 && l.creditHealthScore <= 20);
            const aboveRate = xrayLeads.filter(l => (l.effectiveRate || 0) > 0.23);
            const desertRevenue = xrayLeads.filter(l => l.creditHealthScore <= 20 && (l.revenue || 0) > 0);
            const vectors = [
              { key: "high_rd_no_credit", count: rdNoCredit.length, value: rdNoCredit.reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0), label: "R&D spend, zero credits", desc: "IRC §41 recovery candidates", color: "border-red-500/20 hover:border-red-400/30", glow: "shadow-red-500/5", icon: Sparkles, priority: "HIGH" },
              { key: "above_rate_opportunity", count: aboveRate.length, value: aboveRate.reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0), label: "Above statutory rate", desc: "Tax optimization targets", color: "border-amber-500/20 hover:border-amber-400/30", glow: "shadow-amber-500/5", icon: TrendingUp, priority: "HIGH" },
              { key: "credit_desert_with_revenue", count: desertRevenue.length, value: desertRevenue.reduce((s, l) => s + (l.revenue || 0), 0), label: "Revenue + credit desert", desc: "Highest outreach value", color: "border-emerald-500/20 hover:border-emerald-400/30", glow: "shadow-emerald-500/5", icon: DollarSign, priority: "MED" },
            ].filter(v => v.count > 0);
            if (vectors.length === 0) return null;
            return (
              <div className="space-y-2" style={{ animation: "fadeSlideIn 0.5s ease-out 0.1s both" }}>
                <div className="text-[11px] uppercase tracking-widest text-amber-400/25 font-medium px-1">Priority Vectors</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {vectors.map(v => (
                    <button key={v.key}
                      onClick={() => setIntelFilter(prev => prev.cluster === v.key ? { ...prev, cluster: undefined } : { cluster: v.key })}
                      className={`qi-button qi-panel text-left p-4 border-l-2 ${v.color} ${intelFilter.cluster === v.key ? "qi-active" : ""}`}
                      data-testid={`vector-${v.key}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${v.priority === "HIGH" ? "bg-red-500/15 text-red-300/70" : "bg-amber-500/15 text-amber-300/70"}`}>
                          {v.priority}
                        </span>
                        <v.icon className="w-4 h-4 text-amber-300/40" />
                      </div>
                      <div className="text-sm font-medium text-amber-200/70 mb-0.5">{v.count} leads — {v.label}</div>
                      <div className="text-xs text-amber-400/30 mb-2">{v.desc}</div>
                      <div className="text-sm font-semibold text-amber-200/60 tabular-nums">{formatCurrency(v.value)}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {(() => {
            const topLeads = [...allLeads].filter(l => l.estimatedUnclaimedValue > 0).sort((a, b) => b.estimatedUnclaimedValue - a.estimatedUnclaimedValue).slice(0, 5);
            if (topLeads.length === 0) return null;
            return (
              <div className="qi-panel p-4 space-y-3" style={{ animation: "fadeSlideIn 0.5s ease-out 0.15s both" }} data-testid="panel-top-leads">
                <div className="text-[11px] uppercase tracking-widest text-amber-400/25 font-medium">Top Leads by Unclaimed Value</div>
                <div className="space-y-1">
                  {topLeads.map((tl, idx) => {
                    const src = (tl as any).enrichmentData?.discoverySource || "sic";
                    return (
                      <button key={tl.leadId}
                        onClick={() => { setExpandedId(tl.leadId); setTimeout(() => document.querySelector(`[data-lead-id="${tl.leadId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100); }}
                        className="qi-button w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-amber-500/5 transition-all text-left"
                        data-testid={`top-lead-${idx}`}>
                        <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-300/50 shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-amber-200/70 truncate">{tl.company}</div>
                          <div className="text-xs text-amber-400/25 truncate">{tl.sicDescription}</div>
                        </div>
                        {src !== "sic" && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${src === "formD" ? "border-violet-500/20 text-violet-300/50" : "border-cyan-500/20 text-cyan-300/50"}`}>
                            {src === "formD" ? "Form D" : "EFTS"}
                          </span>
                        )}
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-amber-200/70 tabular-nums">{formatCurrency(tl.estimatedUnclaimedValue)}</div>
                          <div className={`text-[10px] ${tl.creditHealthScore <= 20 ? "text-red-400/50" : tl.creditHealthScore <= 60 ? "text-amber-400/50" : "text-emerald-400/50"}`}>
                            health {tl.creditHealthScore}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400/20 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center gap-1.5 border-b border-amber-500/10 pb-2">
            {([
              { key: "overview", label: "Overview", icon: Activity, axis: "X" },
              { key: "clusters", label: "Clusters", icon: Zap, axis: "Y" },
              { key: "legislation", label: "Legislative", icon: Landmark, axis: "Z" },
              { key: "crossref", label: "Cross-Ref", icon: BarChart3, axis: "W" },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setIntelTab(tab.key)} data-testid={`tab-intel-${tab.key}`}
                className={`qi-button flex items-center gap-2 px-4 py-2 text-[13px] rounded-t-lg transition-all ${intelTab === tab.key
                  ? "bg-amber-500/10 text-amber-200/70 border border-b-0 border-amber-500/15 shadow-[0_-2px_12px_rgba(245,158,11,0.06)]"
                  : "text-amber-400/30 hover:text-amber-400/50 hover:bg-amber-500/5"}`}>
                <tab.icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
                <span className="text-[9px] font-mono text-amber-500/20 ml-0.5">{tab.axis}</span>
              </button>
            ))}
          </div>

          <div className="qi-shift" key={intelTab}>
          {intelTab === "overview" && (
            <div className="space-y-4">
              <div className="qi-panel p-4 space-y-3" data-testid="panel-insights">
                <div className="text-[11px] uppercase tracking-widest text-amber-400/25 font-medium">Actionable Insights</div>
                {(() => {
                  const xrayed = agg.leadsWithXray;
                  const xrayLeads = allLeads.filter(l => l.xbrlDepth > 0);
                  type Insight = { priority: "HIGH" | "MED"; text: string; metric: string; filter: Record<string, string>; color: string };
                  const insights: Insight[] = [];
                  const aboveRate = agg.rateDistribution.aboveStatutory;
                  if (aboveRate > 0) {
                    const val = xrayLeads.filter(l => (l.effectiveRate || 0) > 0.23).reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0);
                    insights.push({ priority: "HIGH", text: `${aboveRate} companies paying above 23% ETR`, metric: formatCurrency(val) + " unclaimed", filter: { rateTier: "aboveStatutory" }, color: "border-l-red-400/40" });
                  }
                  const rdDeserts = xrayLeads.filter(l => (l.rdExpense || 0) > 0 && l.creditHealthScore <= 20);
                  if (rdDeserts.length > 0) insights.push({ priority: "HIGH", text: `${rdDeserts.length} leads with R&D spending but zero credits`, metric: "IRC §41 recovery", filter: { cluster: "high_rd_no_credit" }, color: "border-l-amber-400/40" });
                  const deserts = agg.healthTiers.creditDesert;
                  if (deserts > 0) insights.push({ priority: "MED", text: `${deserts} credit deserts identified`, metric: formatCurrency(agg.totalUnclaimedValue) + " total unclaimed", filter: { healthTier: "creditDesert" }, color: "border-l-amber-400/30" });
                  if (agg.totalNol > 0) insights.push({ priority: "MED", text: `${formatCurrency(agg.totalNol)} in NOL carryforwards`, metric: "future tax shield potential", filter: { cluster: "nol_shield" }, color: "border-l-cyan-400/30" });
                  const topCredit = Object.entries(agg.creditStatusCounts).sort((a, b) => (b[1].unclaimed + b[1].likely_unclaimed) - (a[1].unclaimed + a[1].likely_unclaimed))[0];
                  if (topCredit) insights.push({ priority: "MED", text: `Most neglected: ${topCredit[0].replace(/_/g, " ")}`, metric: `${topCredit[1].unclaimed + topCredit[1].likely_unclaimed} leads not claiming`, filter: { credit: topCredit[0] }, color: "border-l-violet-400/30" });
                  return insights.slice(0, 5).map((ins, i) => (
                    <div key={i} className={`qi-button flex items-center gap-3 p-3 rounded-lg border border-amber-500/6 border-l-2 ${ins.color} hover:bg-amber-500/3 transition-all`}
                      style={{ animation: `fadeSlideIn 0.4s ease-out ${i * 0.05}s both` }}>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${ins.priority === "HIGH" ? "bg-red-500/15 text-red-300/60" : "bg-amber-500/10 text-amber-300/50"}`}>
                        {ins.priority}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-amber-200/60">{ins.text}</div>
                        <div className="text-xs text-amber-400/30">{ins.metric}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setIntelFilter(ins.filter); }}
                        className="qi-button shrink-0 px-2.5 py-1 rounded-lg text-[11px] bg-amber-500/8 border border-amber-500/12 text-amber-300/50 hover:bg-amber-500/15 hover:text-amber-200/70 transition-all"
                        data-testid={`insight-filter-${i}`}>
                        Filter <ChevronRight className="w-3 h-3 inline" />
                      </button>
                    </div>
                  ));
                })()}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="qi-panel p-4 space-y-3 qi-stagger-1">
                  <div className="text-[11px] uppercase tracking-widest text-amber-400/25 font-medium">Financial Dimensions</div>

                  <div className="space-y-1.5">
                    <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Credit Health</div>
                    {[
                      { key: "creditDesert", label: "Desert (0–20)", count: agg.healthTiers.creditDesert, color: "text-red-400/50" },
                      { key: "underexplored", label: "Underexplored", count: agg.healthTiers.underexplored, color: "text-amber-400/50" },
                      { key: "partialCoverage", label: "Partial", count: agg.healthTiers.partialCoverage, color: "text-yellow-400/50" },
                      { key: "wellManaged", label: "Well Managed", count: agg.healthTiers.wellManaged, color: "text-emerald-400/50" },
                      { key: "fullyOptimized", label: "Optimized", count: agg.healthTiers.fullyOptimized, color: "text-green-400/50" },
                    ].filter(t => t.count > 0).map(t => (
                      <button key={t.key} onClick={() => setIntelFilter(prev => prev.healthTier === t.key ? { ...prev, healthTier: undefined } : { ...prev, healthTier: t.key })}
                        className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.healthTier === t.key ? "qi-active bg-amber-500/8" : "hover:bg-amber-500/5"}`} data-testid={`filter-health-${t.key}`}>
                        <div className="w-28 text-amber-400/40 truncate">{t.label}</div>
                        <div className="qi-bar flex-1">
                          <div className={`qi-bar-fill ${t.color}`} style={{ width: `${agg.leadsWithXray > 0 ? (t.count / agg.leadsWithXray) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{t.count}</span>
                      </button>
                    ))}
                  </div>

                  <Separator className="bg-amber-500/6" />

                  <div className="space-y-1.5">
                    <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><Landmark className="w-3.5 h-3.5" /> Effective Tax Rate</div>
                    {[
                      { key: "belowStatutory", label: "Below 19%", count: agg.rateDistribution.belowStatutory, color: "text-emerald-400/50" },
                      { key: "atStatutory", label: "19–23%", count: agg.rateDistribution.atStatutory, color: "text-yellow-400/50" },
                      { key: "aboveStatutory", label: "Above 23%", count: agg.rateDistribution.aboveStatutory, color: "text-red-400/50" },
                      { key: "negative", label: "Negative", count: agg.rateDistribution.negative, color: "text-cyan-400/50" },
                    ].filter(t => t.count > 0).map(t => (
                      <button key={t.key} onClick={() => setIntelFilter(prev => prev.rateTier === t.key ? { ...prev, rateTier: undefined } : { ...prev, rateTier: t.key })}
                        className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.rateTier === t.key ? "qi-active bg-amber-500/8" : "hover:bg-amber-500/5"}`} data-testid={`filter-rate-${t.key}`}>
                        <div className="w-28 text-amber-400/40">{t.label}</div>
                        <div className="qi-bar flex-1">
                          <div className={`qi-bar-fill ${t.color}`} style={{ width: `${agg.leadsWithXray > 0 ? (t.count / agg.leadsWithXray) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{t.count}</span>
                      </button>
                    ))}
                  </div>

                  <Separator className="bg-amber-500/6" />

                  <div className="space-y-1.5">
                    <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> Revenue</div>
                    {[
                      { key: "micro", label: "<$1M", count: agg.revenueTiers.micro, color: "text-zinc-400/40" },
                      { key: "small", label: "$1M–$10M", count: agg.revenueTiers.small, color: "text-amber-400/40" },
                      { key: "mid", label: "$10M–$100M", count: agg.revenueTiers.mid, color: "text-amber-400/55" },
                      { key: "large", label: "$100M–$1B", count: agg.revenueTiers.large, color: "text-amber-400/65" },
                      { key: "enterprise", label: "$1B+", count: agg.revenueTiers.enterprise, color: "text-amber-300/75" },
                    ].filter(t => t.count > 0).map(t => (
                      <button key={t.key} onClick={() => setIntelFilter(prev => prev.revenueTier === t.key ? { ...prev, revenueTier: undefined } : { ...prev, revenueTier: t.key })}
                        className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.revenueTier === t.key ? "qi-active bg-amber-500/8" : "hover:bg-amber-500/5"}`} data-testid={`filter-rev-${t.key}`}>
                        <div className="w-28 text-amber-400/40">{t.label}</div>
                        <div className="qi-bar flex-1">
                          <div className={`qi-bar-fill ${t.color}`} style={{ width: `${agg.leadsWithXray > 0 ? (t.count / agg.leadsWithXray) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{t.count}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="qi-panel p-4 space-y-3 qi-stagger-2">
                  <div className="text-[11px] uppercase tracking-widest text-amber-400/25 font-medium">Company Dimensions</div>

                  <div className="space-y-1.5">
                    <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Employee Size</div>
                    {[
                      { key: "tiny", label: "<50", count: agg.employeeRanges.tiny, color: "text-zinc-400/40" },
                      { key: "small", label: "50–250", count: agg.employeeRanges.small, color: "text-emerald-400/40" },
                      { key: "medium", label: "250–1K", count: agg.employeeRanges.medium, color: "text-emerald-400/55" },
                      { key: "large", label: "1K–10K", count: agg.employeeRanges.large, color: "text-emerald-400/65" },
                      { key: "enterprise", label: "10K+", count: agg.employeeRanges.enterprise, color: "text-emerald-300/75" },
                    ].filter(t => t.count > 0).map(t => (
                      <button key={t.key} onClick={() => setIntelFilter(prev => prev.empTier === t.key ? { ...prev, empTier: undefined } : { ...prev, empTier: t.key })}
                        className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.empTier === t.key ? "qi-active bg-emerald-500/6" : "hover:bg-emerald-500/4"}`} data-testid={`filter-emp-${t.key}`}>
                        <div className="w-28 text-amber-400/40">{t.label}</div>
                        <div className="qi-bar flex-1">
                          <div className={`qi-bar-fill ${t.color}`} style={{ width: `${(Object.values(agg.employeeRanges).reduce((s, v) => s + v, 0) || 1) > 0 ? (t.count / (Object.values(agg.employeeRanges).reduce((s, v) => s + v, 0) || 1)) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{t.count}</span>
                      </button>
                    ))}
                  </div>

                  {Object.keys(agg.entityTypeCounts).length > 0 && (<>
                    <Separator className="bg-amber-500/6" />
                    <div className="space-y-1.5">
                      <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Entity Types</div>
                      {Object.entries(agg.entityTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, count]) => {
                        const total = Object.values(agg.entityTypeCounts).reduce((s, v) => s + v, 0);
                        return (
                          <button key={type} onClick={() => setIntelFilter(prev => prev.entityType === type ? { ...prev, entityType: undefined } : { ...prev, entityType: type })}
                            className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.entityType === type ? "qi-active bg-violet-500/6" : "hover:bg-violet-500/4"}`} data-testid={`filter-entity-${type}`}>
                            <div className="w-28 text-amber-400/40 truncate">{type}</div>
                            <div className="qi-bar flex-1">
                              <div className="qi-bar-fill text-violet-400/50" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                            </div>
                            <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>)}

                  <Separator className="bg-amber-500/6" />

                  <div className="space-y-1.5">
                    <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Filing Recency</div>
                    {[
                      { label: "Current (≤1yr)", count: agg.filingRecency.current, color: "text-emerald-400/55" },
                      { label: "Recent (1–2yr)", count: agg.filingRecency.recent, color: "text-yellow-400/50" },
                      { label: "Aging (2–4yr)", count: agg.filingRecency.aging, color: "text-amber-400/50" },
                      { label: "Stale (4yr+)", count: agg.filingRecency.stale, color: "text-red-400/40" },
                    ].filter(t => t.count > 0).map(t => (
                      <div key={t.label} className="flex items-center gap-2.5 text-xs px-2 py-1.5">
                        <div className="w-28 text-amber-400/40 truncate">{t.label}</div>
                        <div className="qi-bar flex-1">
                          <div className={`qi-bar-fill ${t.color}`} style={{ width: `${agg.leadsWithXray > 0 ? (t.count / agg.leadsWithXray) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{t.count}</span>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const sourceCounts: Record<string, number> = {};
                    let eventCount = 0;
                    for (const l of allLeads) {
                      const src = (l as any).enrichmentData?.discoverySource || "sic";
                      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
                      const events = (l as any).enrichmentData?.recentEvents;
                      if (events?.length > 0) eventCount++;
                    }
                    if (Object.keys(sourceCounts).length <= 1 && eventCount === 0) return null;
                    return (<>
                      <Separator className="bg-amber-500/6" />
                      <div className="space-y-1.5">
                        <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" /> Discovery Sources</div>
                        {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, cnt]) => (
                          <button key={src} onClick={() => setIntelFilter(prev => prev.discoverySource === src ? { ...prev, discoverySource: undefined } : { ...prev, discoverySource: src })}
                            className={`qi-button flex items-center gap-2.5 text-xs w-full text-left rounded-lg px-2 py-1.5 transition-all ${intelFilter.discoverySource === src ? "qi-active bg-cyan-500/6" : "hover:bg-cyan-500/4"}`} data-testid={`filter-source-${src}`}>
                            <div className="w-28 text-amber-400/40">{src === "sic" ? "SIC Industry" : src === "formD" ? "Form D" : src === "efts" ? "Filing Search" : src}</div>
                            <div className="qi-bar flex-1">
                              <div className={`qi-bar-fill ${src === "formD" ? "text-violet-400/50" : src === "efts" ? "text-cyan-400/50" : "text-amber-400/50"}`}
                                style={{ width: `${allLeads.length > 0 ? (cnt / allLeads.length) * 100 : 0}%` }} />
                            </div>
                            <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{cnt}</span>
                          </button>
                        ))}
                        {eventCount > 0 && (
                          <div className="flex items-center gap-2 px-2 py-1 text-xs text-amber-400/30">
                            <Zap className="w-3.5 h-3.5 text-orange-400/40" />
                            <span>{eventCount} leads with recent 8-K events</span>
                          </div>
                        )}
                      </div>
                    </>);
                  })()}
                </div>
              </div>

              {Object.keys(agg.stateCounts).length > 1 && (
                <div className="qi-panel p-4 space-y-2.5 qi-stagger-3">
                  <div className="text-xs text-amber-400/30 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Geography</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(agg.stateCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 25).map(([st, data]) => (
                      <button key={st} onClick={() => setIntelFilter(prev => prev.state === st ? { ...prev, state: undefined } : { ...prev, state: st })}
                        className={`qi-button inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${intelFilter.state === st
                          ? "qi-active bg-amber-500/12 border-amber-400/25 text-amber-200/65"
                          : "bg-amber-500/4 border-amber-500/8 text-amber-400/45 hover:bg-amber-500/8 hover:border-amber-400/15"}`} data-testid={`filter-state-${st}`}>
                        <span className="font-medium">{st}</span>
                        <span className="tabular-nums">{data.count}</span>
                        {data.unclaimed > 0 && <span className="text-amber-400/25">· {formatCurrency(data.unclaimed)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {intelTab === "clusters" && (
            <div className="space-y-4">
              <p className="text-xs text-amber-400/30">Select an energy state to filter the lead list to matching companies</p>
              {(() => {
                const xrayLeads = allLeads.filter(l => l.xbrlDepth > 0);
                const clusters = [
                  { key: "high_rd_no_credit", label: "High R&D, Zero Credit Utilization", desc: "Companies spending on R&D but claiming no credits — IRC §41 opportunity", color: "border-red-500/15",
                    count: xrayLeads.filter(l => (l.rdExpense || 0) > 0 && l.creditHealthScore <= 20).length,
                    value: xrayLeads.filter(l => (l.rdExpense || 0) > 0 && l.creditHealthScore <= 20).reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0),
                    icon: Sparkles },
                  { key: "above_rate_opportunity", label: "Above Statutory Rate", desc: "Paying >23% effective rate — tax optimization and credit recovery", color: "border-amber-500/15",
                    count: xrayLeads.filter(l => (l.effectiveRate || 0) > 0.23).length,
                    value: xrayLeads.filter(l => (l.effectiveRate || 0) > 0.23).reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0),
                    icon: TrendingUp },
                  { key: "nol_shield", label: "NOL Carryforward Holders", desc: "Net operating losses — future tax shield + strategic planning", color: "border-cyan-500/15",
                    count: xrayLeads.filter(l => (l.nolCarryforward || 0) > 0).length,
                    value: xrayLeads.filter(l => (l.nolCarryforward || 0) > 0).reduce((s, l) => s + (l.nolCarryforward || 0), 0),
                    icon: Shield },
                  { key: "credit_desert_with_revenue", label: "Revenue-Generating Credit Deserts", desc: "Revenue but zero credit health — biggest outreach targets", color: "border-emerald-500/15",
                    count: xrayLeads.filter(l => l.creditHealthScore <= 20 && (l.revenue || 0) > 0).length,
                    value: xrayLeads.filter(l => l.creditHealthScore <= 20 && (l.revenue || 0) > 0).reduce((s, l) => s + (l.revenue || 0), 0),
                    icon: DollarSign },
                  { key: "large_unclaimed", label: "High-Value Unclaimed", desc: "Individual leads with >$100K estimated unclaimed credit value", color: "border-yellow-500/15",
                    count: xrayLeads.filter(l => (l.estimatedUnclaimedValue || 0) > 100000).length,
                    value: xrayLeads.filter(l => (l.estimatedUnclaimedValue || 0) > 100000).reduce((s, l) => s + (l.estimatedUnclaimedValue || 0), 0),
                    icon: Coins },
                ];
                const maxVal = Math.max(...clusters.map(c => c.value), 1);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {clusters.map((c, i) => (
                      <button key={c.key} onClick={() => setIntelFilter(prev => prev.cluster === c.key ? { ...prev, cluster: undefined } : { cluster: c.key })}
                        className={`qi-button qi-panel text-left p-4 border ${c.color} transition-all ${intelFilter.cluster === c.key ? "qi-active" : ""}`}
                        style={{ animation: `fadeSlideIn 0.4s ease-out ${i * 0.06}s both` }}
                        data-testid={`cluster-${c.key}`}>
                        <div className="flex items-center gap-2.5 mb-2">
                          <c.icon className="w-5 h-5 text-amber-300/45" />
                          <span className="text-[13px] font-medium text-amber-200/65">{c.label}</span>
                          <span className="ml-auto text-lg font-bold text-amber-200/75 tabular-nums">{c.count}</span>
                        </div>
                        <p className="text-xs text-amber-400/30 mb-3">{c.desc}</p>
                        <div className="space-y-1.5">
                          <div className="qi-bar">
                            <div className="qi-bar-fill text-amber-400/35" style={{ width: `${(c.value / maxVal) * 100}%` }} />
                          </div>
                          <div className="text-xs text-amber-400/35 tabular-nums">{c.key === "nol_shield" || c.key === "credit_desert_with_revenue" ? formatCurrency(c.value) + (c.key === "nol_shield" ? " in losses" : " combined revenue") : formatCurrency(c.value) + " unclaimed value"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {intelTab === "legislation" && (
            <div className="space-y-4">
              <p className="text-xs text-amber-400/30">38 federal/state tax credits mapped to your leads — click any credit to filter</p>
              {(() => {
                const legislationGroups: Record<string, typeof credits> = {};
                for (const c of credits) {
                  const act = c.section.includes("CHIPS") ? "CHIPS & Science Act" :
                    ["§48", "§45", "§45Q", "§45V", "§45U", "§45X", "§48C", "§45W", "§30D", "§40B", "§30C", "§45L", "§179D"].some(s => c.section.includes(s)) ? "Inflation Reduction Act" :
                    c.section.includes("§1400Z") ? "Tax Cuts & Jobs Act" :
                    c.section.includes("§199A") ? "Tax Cuts & Jobs Act" :
                    c.section.includes("§168(k)") ? "Tax Cuts & Jobs Act" :
                    "Internal Revenue Code";
                  if (!legislationGroups[act]) legislationGroups[act] = [];
                  legislationGroups[act].push(c);
                }
                return Object.entries(legislationGroups).sort((a, b) => b[1].length - a[1].length).map(([act, creds], gi) => (
                  <div key={act} className="qi-panel p-4 space-y-2.5" style={{ animation: `fadeSlideIn 0.4s ease-out ${gi * 0.06}s both` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-amber-400/30 uppercase tracking-wider font-medium"><Landmark className="w-4 h-4" /> {act}</div>
                      <span className="text-[11px] text-amber-400/20">{creds.length} provisions</span>
                    </div>
                    <div className="space-y-1">
                      {creds.map(credit => {
                        const status = agg.creditStatusCounts[credit.id];
                        const unclaimed = status ? status.unclaimed + status.likely_unclaimed : 0;
                        const total = status ? status.unclaimed + status.likely_unclaimed + status.active + status.partial + status.unknown : 0;
                        return (
                          <button key={credit.id} onClick={() => setIntelFilter(prev => prev.credit === credit.id ? { ...prev, credit: undefined } : { ...prev, credit: credit.id })}
                            className={`qi-button w-full text-left rounded-lg p-3 border transition-all ${intelFilter.credit === credit.id ? "qi-active bg-amber-500/8 border-amber-500/20" : "border-transparent hover:bg-amber-500/4"}`} data-testid={`filter-credit-${credit.id}`}>
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-medium text-amber-300/55">{credit.section}</span>
                              <span className="text-[13px] text-amber-200/55">{credit.name}</span>
                              <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-md ${credit.neglectLevel === "high" ? "bg-red-500/10 text-red-300/55" : credit.neglectLevel === "medium" ? "bg-amber-500/10 text-amber-300/55" : "bg-emerald-500/10 text-emerald-300/55"}`}>
                                {credit.neglectLevel} neglect
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-400/25 mt-1 line-clamp-1">{credit.description}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[11px] text-amber-400/25">{credit.maxValue}</span>
                              {total > 0 && (
                                <div className="flex items-center gap-1.5 ml-auto">
                                  <div className="qi-bar w-20">
                                    {status.active > 0 && <div className="qi-bar-fill text-emerald-400/55 absolute" style={{ width: `${(status.active / total) * 100}%` }} />}
                                    {status.partial > 0 && <div className="qi-bar-fill text-yellow-400/45 absolute" style={{ width: `${(status.partial / total) * 100}%`, left: `${(status.active / total) * 100}%` }} />}
                                    {(status.likely_unclaimed + status.unclaimed) > 0 && <div className="qi-bar-fill text-red-400/45 absolute" style={{ width: `${((status.likely_unclaimed + status.unclaimed) / total) * 100}%`, left: `${((status.active + status.partial) / total) * 100}%` }} />}
                                  </div>
                                  <span className="text-[11px] text-red-300/45 tabular-nums">{unclaimed}/{total}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {intelTab === "crossref" && (
            <div className="space-y-4">
              <p className="text-xs text-amber-400/30">Credit utilization matrix — industry vs. credit type. Click cells to filter.</p>
              {(() => {
                const xrayLeads = allLeads.filter(l => l.xbrlDepth > 0);
                const industries = Array.from(new Set(xrayLeads.map(l => l.industryCategory).filter(Boolean))).sort();
                const topCredits = Object.entries(agg.creditStatusCounts)
                  .sort((a, b) => (b[1].unclaimed + b[1].likely_unclaimed) - (a[1].unclaimed + a[1].likely_unclaimed))
                  .slice(0, 8)
                  .map(([id]) => id);

                return (
                  <div className="qi-panel p-4 overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr>
                          <th className="text-left text-amber-400/30 p-2 font-medium">Industry</th>
                          {topCredits.map(cId => {
                            const cn = credits.find(c => c.id === cId);
                            return <th key={cId} className="text-center text-amber-400/25 p-2 font-normal w-20" title={cn?.name || cId}>{cn?.section || cId}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {industries.map(ind => {
                          const indLeads = xrayLeads.filter(l => l.industryCategory === ind);
                          return (
                            <tr key={ind} className="border-t border-amber-500/6">
                              <td className="text-amber-400/35 p-2 truncate max-w-[160px] text-xs">{ind}</td>
                              {topCredits.map(cId => {
                                const withCredit = indLeads.filter(l => l.creditAnalysis?.some(c => c.creditId === cId));
                                const unclaimed = withCredit.filter(l => l.creditAnalysis?.some(c => c.creditId === cId && (c.status === "unclaimed" || c.status === "likely_unclaimed")));
                                if (withCredit.length === 0) return <td key={cId} className="text-center p-2 text-zinc-600/25">—</td>;
                                const ratio = unclaimed.length / withCredit.length;
                                return (
                                  <td key={cId} className="text-center p-2">
                                    <button onClick={() => setIntelFilter(prev => prev.credit === cId ? { ...prev, credit: undefined } : { ...prev, credit: cId })}
                                      data-testid={`crossref-${ind}-${cId}`}
                                      className={`qi-button px-2 py-1 rounded-lg text-[11px] tabular-nums transition-all ${intelFilter.credit === cId ? "qi-active " : ""}${ratio > 0.7 ? "bg-red-500/10 text-red-300/50 hover:bg-red-500/15" : ratio > 0.3 ? "bg-amber-500/10 text-amber-300/50 hover:bg-amber-500/15" : "bg-emerald-500/10 text-emerald-300/50 hover:bg-emerald-500/15"}`}>
                                      {unclaimed.length}/{withCredit.length}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {Object.keys(agg.industryCounts).length > 1 && (
                <div className="qi-panel p-4 space-y-2.5 qi-stagger-1">
                  <div className="text-xs text-amber-400/30 flex items-center gap-1.5 font-medium"><Factory className="w-3.5 h-3.5" /> Industry Breakdown</div>
                  <div className="space-y-1.5">
                    {Object.entries(agg.industryCounts).sort((a, b) => b[1].totalUnclaimed - a[1].totalUnclaimed).slice(0, 10).map(([cat, data]) => (
                      <div key={cat} className="flex items-center gap-2.5 text-xs px-2 py-1">
                        <div className="w-40 text-amber-400/35 truncate">{cat}</div>
                        <div className="qi-bar flex-1">
                          <div className="qi-bar-fill text-amber-400/35" style={{ width: `${agg.totalLeads > 0 ? (data.count / agg.totalLeads) * 100 : 0}%` }} />
                        </div>
                        <span className="w-7 text-right text-amber-300/40 tabular-nums font-medium">{data.count}</span>
                        {data.totalUnclaimed > 0 && <span className="w-24 text-right text-amber-400/25 text-[11px] tabular-nums">{formatCurrency(data.totalUnclaimed)}</span>}
                        {data.avgHealth > 0 && <span className="w-10 text-right text-amber-400/20 text-[11px] tabular-nums">h{data.avgHealth}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-[11px] text-amber-400/25 px-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500/12 border border-red-500/20" /> {">"}70% unclaimed</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500/12 border border-amber-500/20" /> 30–70%</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/12 border border-emerald-500/20" /> {"<"}30%</span>
              </div>
            </div>
          )}
          </div>
        </div>
  );
}
