import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import {
  Sun, Building2, ChevronRight, ChevronDown, Copy, CheckCircle, Send,
  Zap, ArrowRight, Loader2, Search, Eye,
  Lock, Globe2, MessageSquare, Calendar,
  Shield, Type, AtSign, Phone, Hash, LayoutGrid,
  Flower2, Radio, ArrowRightLeft,
  ShieldCheck, ShieldAlert, Bot, Bug, Radar, Activity,
  Coins, Sparkles, TreePine, Landmark,
  XCircle, MinusCircle, Leaf,
  BarChart3, MapPin, TrendingUp, DollarSign, Users, FileText, Factory,
  GitBranch, Brain, FolderOpen, ArrowDown, Layers, Target,
  ArrowDownCircle, HelpCircle, AlertTriangle, Info, Database,
} from "lucide-react";
import { Shape4DCanvas } from "@/components/shapes-4d";
import { HowToGuide } from "@/components/how-to-guide";
import { IntelDashboard } from "@/components/light/IntelDashboard";
import { SecurityDialog } from "@/components/light/SecurityDialog";
import type { FormField, DiscoveredForm, SecurityProfile, AdIntel, ApplicableCredit, CreditAnalysisItem, TaxPositionSummary, LeadDelta } from "@/components/light/types";
import { FORM_LABELS as FORM_LABELS_IMPORTED } from "@/components/light/types";

interface DeltaMap {
  leads: LeadDelta[];
  aggregate: {
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
  };
}

interface IndustryTree {
  categories: string[];
  industries: Record<string, { key: string; label: string; tier: number; codes: string[] }[]>;
  totalCount: number;
}

const FORM_LABELS = FORM_LABELS_IMPORTED;

const FIELD_ICONS: Record<string, any> = {
  email: AtSign, text: Type, textarea: MessageSquare, tel: Phone, number: Hash,
  password: Lock, url: Globe2, date: Calendar, select: LayoutGrid, checkbox: CheckCircle,
};

const AD_NETWORK_COLORS: Record<string, string> = {
  "Google Ads": "text-blue-400/70 border-blue-500/20",
  "Google AdSense": "text-green-400/70 border-green-500/20",
  "Google Analytics": "text-orange-400/60 border-orange-500/15",
  "Google Tag Manager": "text-sky-400/60 border-sky-500/15",
  "Facebook": "text-indigo-400/70 border-indigo-500/20",
  "LinkedIn": "text-sky-400/70 border-sky-500/20",
  "TikTok": "text-pink-400/70 border-pink-500/20",
  "Twitter/X": "text-slate-300/70 border-slate-400/20",
  "Pinterest": "text-red-400/60 border-red-500/15",
  "Snapchat": "text-yellow-300/70 border-yellow-400/20",
  "HubSpot": "text-orange-400/70 border-orange-500/20",
  "Hotjar": "text-red-400/70 border-red-500/20",
  "Segment": "text-emerald-400/60 border-emerald-500/15",
  "Mixpanel": "text-purple-400/60 border-purple-500/15",
  "Intercom": "text-blue-300/60 border-blue-400/15",
  "Amplitude": "text-blue-400/60 border-blue-500/15",
  "Heap": "text-violet-400/60 border-violet-500/15",
  "Clarity": "text-cyan-400/60 border-cyan-500/15",
};

const NEGLECT_COLORS: Record<string, string> = {
  high: "text-amber-300/80 border-amber-400/25 bg-amber-500/8",
  medium: "text-amber-400/50 border-amber-500/15",
  low: "text-amber-500/30 border-amber-500/10",
};

function formatCurrency(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function getLightPhase(history: any[]) {
  if (!history?.length) return { output: 0, light: 0, input: 0 };
  let output = 0, light = 0, input = 0;
  for (const h of history) {
    if (h.status === "composed") output++;
    else if (h.status === "pushed") { output++; light++; }
    else if (h.status === "exchanged") { output++; light++; }
    else if (h.status === "received") { output++; light++; input++; }
  }
  return { output, light, input };
}


function GoldenCashews({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="absolute"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: `-${10 + Math.random() * 20}px`,
            animation: `cashewFall ${1 + Math.random() * 1.5}s ease-in forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
            opacity: 0.8 + Math.random() * 0.2,
          }}>
          <Coins className="text-amber-400" style={{ width: `${14 + Math.random() * 10}px`, height: `${14 + Math.random() * 10}px` }} />
        </div>
      ))}
      <style>{`
        @keyframes cashewFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
          70% { opacity: 0.7; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes tesseractPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); transform: scale(1); }
          50% { box-shadow: 0 0 20px 4px rgba(245, 158, 11, 0.08); transform: scale(1.015); }
        }
        @keyframes dimensionShift {
          0% { transform: perspective(1200px) rotateX(0deg); }
          30% { transform: perspective(1200px) rotateX(1.5deg); }
          100% { transform: perspective(1200px) rotateX(0deg); }
        }
        @keyframes glowRipple {
          0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.15); }
          50% { box-shadow: 0 0 12px 3px rgba(245, 158, 11, 0.08); }
          100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
        }
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes coreGlow {
          0%, 100% { box-shadow: 0 0 30px 8px rgba(245, 158, 11, 0.04), inset 0 0 20px rgba(245, 158, 11, 0.02); }
          50% { box-shadow: 0 0 50px 16px rgba(245, 158, 11, 0.08), inset 0 0 30px rgba(245, 158, 11, 0.04); }
        }
        @keyframes barFill {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        .qi-panel {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.03) 0%, rgba(24, 24, 27, 0.4) 100%);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(245, 158, 11, 0.08);
          border-radius: 12px;
          transform: translateZ(0);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform, box-shadow;
          animation: fadeSlideIn 0.4s ease-out both;
        }
        .qi-panel:hover {
          border-color: rgba(245, 158, 11, 0.15);
          box-shadow: 0 4px 20px rgba(245, 158, 11, 0.05), 0 0 0 1px rgba(245, 158, 11, 0.03);
        }
        .qi-button {
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          transform: perspective(800px) rotateX(0deg) rotateY(0deg);
          will-change: transform;
        }
        .qi-button:hover {
          transform: perspective(800px) rotateX(-1deg) translateY(-1px);
          box-shadow: 0 4px 16px rgba(245, 158, 11, 0.06);
        }
        .qi-button:active {
          transform: perspective(800px) rotateX(0.5deg) scale(0.98);
          transition-duration: 0.1s;
        }
        .qi-bar {
          position: relative;
          overflow: hidden;
          border-radius: 9999px;
          height: 8px;
          background: rgba(39, 39, 42, 0.3);
        }
        .qi-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transform-origin: left;
          animation: barFill 0.8s cubic-bezier(0.4, 0, 0.2, 1) both;
          background-image: linear-gradient(90deg, currentColor, currentColor 60%, rgba(255,255,255,0.1));
        }
        .qi-active {
          animation: tesseractPulse 3s ease-in-out infinite;
          border-color: rgba(245, 158, 11, 0.25) !important;
          box-shadow: 0 0 16px 2px rgba(245, 158, 11, 0.06), inset 0 0 8px rgba(245, 158, 11, 0.03);
        }
        .qi-glow-click {
          animation: glowRipple 0.6s ease-out;
        }
        .qi-shift {
          animation: dimensionShift 0.5s ease-out;
        }
        .qi-stagger-1 { animation-delay: 0.05s; }
        .qi-stagger-2 { animation-delay: 0.1s; }
        .qi-stagger-3 { animation-delay: 0.15s; }
        .qi-stagger-4 { animation-delay: 0.2s; }
      `}</style>
    </div>
  );
}

export default function LightEngine() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"forms" | "company" | "ads" | "credits" | "creditHealth" | "unclaimed">("forms");
  const [hideDead, setHideDead] = useState(false);
  const [showIntel, setShowIntel] = useState(false);
  const [intelFilter, setIntelFilter] = useState<{
    healthTier?: string;
    rateTier?: string;
    revenueTier?: string;
    empTier?: string;
    state?: string;
    credit?: string;
    cluster?: string;
    entityType?: string;
    discoverySource?: string;
  }>({});
  const [intelTab, setIntelTab] = useState<"overview" | "crossref" | "legislation" | "clusters">("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<string>("all");
  const [minCredit, setMinCredit] = useState("");
  const [minRdScore, setMinRdScore] = useState("");
  const [securityDomain, setSecurityDomain] = useState<string | null>(null);
  const [showCashews, setShowCashews] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [companySearchResults, setCompanySearchResults] = useState<{ cik: string; ticker: string; title: string }[]>([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [addingCompany, setAddingCompany] = useState<string | null>(null);
  const [bloomIndustry, setBloomIndustry] = useState<string>("");
  const [bloomIndustryOpen, setBloomIndustryOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [bloomState, setBloomState] = useState<string>("");
  const [bloomCount, setBloomCount] = useState<string>("100");
  const [bloomXbrlGate, setBloomXbrlGate] = useState(true);
  const [bloomSources, setBloomSources] = useState<string[]>(["sic"]);
  const [bloomEftsQuery, setBloomEftsQuery] = useState("R&D tax credit");
  const [bloomRunning, setBloomRunning] = useState(false);
  const [bloomPhase, setBloomPhase] = useState("");
  const [bloomProgress, setBloomProgress] = useState<{ stored: number; total: number; scanned: number }>({ stored: 0, total: 0, scanned: 0 });
  const [bloomLog, setBloomLog] = useState<string[]>([]);

  const [xrayRunning, setXrayRunning] = useState(false);
  const [xrayForceMode, setXrayForceMode] = useState(false);
  const [xrayProgress, setXrayProgress] = useState<{ scanned: number; updated: number; failed: number; total: number; skippedDead?: number }>({ scanned: 0, updated: 0, failed: 0, total: 0 });
  const [xrayLog, setXrayLog] = useState<string[]>([]);
  const [formDiscoveryRunning, setFormDiscoveryRunning] = useState(false);
  const [formDiscoveryProgress, setFormDiscoveryProgress] = useState<{ found: number; failed: number; total: number; current?: string }>({ found: 0, failed: 0, total: 0 });
  const [formDiscoveryLog, setFormDiscoveryLog] = useState<string[]>([]);

  const [extrapolateRunning, setExtrapolateRunning] = useState(false);
  const [extrapolateLog, setExtrapolateLog] = useState<string[]>([]);
  const [extrapolateProgress, setExtrapolateProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [deeplogicRunning, setDeeplogicRunning] = useState(false);
  const [deeplogicLog, setDeeplogicLog] = useState<string[]>([]);
  const [deeplogicProgress, setDeeplogicProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [selectedStage2, setSelectedStage2] = useState<Set<string>>(new Set());
  const [selectedStage3, setSelectedStage3] = useState<Set<string>>(new Set());
  const [pipelineView, setPipelineView] = useState<"stages" | "all">("stages");
  const [expandedCredits, setExpandedCredits] = useState<Set<string>>(new Set());
  const toggleCreditExpand = useCallback((key: string) => {
    setExpandedCredits(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const startFormDiscovery = useCallback(async () => {
    if (formDiscoveryRunning) return;
    setFormDiscoveryRunning(true);
    setFormDiscoveryProgress({ found: 0, failed: 0, total: 0 });
    setFormDiscoveryLog([]);

    try {
      const resp = await fetch("/api/light/discover-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") setFormDiscoveryLog(prev => [...prev, evt.message]);
            else if (evt.type === "progress") {
              setFormDiscoveryProgress(p => ({ ...p, total: evt.total, current: evt.company }));
            } else if (evt.type === "found") {
              setFormDiscoveryProgress(p => ({ ...p, found: p.found + 1 }));
              setFormDiscoveryLog(prev => [...prev, `Found ${evt.formCount} forms on ${evt.domain} (${evt.company})`]);
            } else if (evt.type === "empty") {
              setFormDiscoveryProgress(p => ({ ...p, failed: p.failed + 1 }));
            } else if (evt.type === "error") {
              setFormDiscoveryProgress(p => ({ ...p, failed: p.failed + 1 }));
              setFormDiscoveryLog(prev => [...prev, `Error: ${evt.domain} — ${evt.error}`]);
            } else if (evt.type === "skip") {
              setFormDiscoveryLog(prev => [...prev, `Skipped ${evt.domain}: ${evt.reason}`]);
            } else if (evt.type === "complete") {
              setFormDiscoveryLog(prev => [...prev, `Complete: ${evt.found} found, ${evt.failed} empty, ${evt.skipped} skipped`]);
              toast({ title: "Form Discovery Complete", description: `Found forms on ${evt.found} of ${evt.total} domains` });
              queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Form Discovery Error", description: err.message, variant: "destructive" });
    }

    setFormDiscoveryRunning(false);
  }, [formDiscoveryRunning, queryClient, toast]);

  const startExtrapolate = useCallback(async (leadIds: string[]) => {
    if (extrapolateRunning || !leadIds.length) return;
    setExtrapolateRunning(true);
    setExtrapolateLog([]);
    setExtrapolateProgress({ current: 0, total: leadIds.length });
    try {
      const res = await fetch("/api/light/extrapolate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") setExtrapolateLog(p => [...p, evt.message]);
            else if (evt.type === "progress") {
              setExtrapolateProgress({ current: evt.index + 1, total: evt.total });
              setExtrapolateLog(p => [...p, `Processing: ${evt.current}`]);
            } else if (evt.type === "enriched") {
              setExtrapolateLog(p => [...p, `${evt.company}: ${evt.forms} forms, ${evt.ads} ad networks`]);
            } else if (evt.type === "skip") {
              setExtrapolateLog(p => [...p, `[SKIP] ${evt.company}: ${evt.reason}`]);
            } else if (evt.type === "warning") {
              setExtrapolateLog(p => [...p, `[WARN] ${evt.company}: ${evt.message}`]);
            } else if (evt.type === "error") {
              setExtrapolateLog(p => [...p, `Error: ${evt.company} — ${evt.error}`]);
            } else if (evt.type === "complete") {
              const enriched = evt.total - (evt.skipped || 0);
              const parts = [`${enriched} enriched`, `${evt.forms} forms`, `${evt.ads} ad networks`, `${evt.credits} credits`];
              if (evt.skipped > 0) parts.push(`${evt.skipped} skipped`);
              if (evt.warnings > 0) parts.push(`${evt.warnings} warnings`);
              setExtrapolateLog(p => [...p, `Complete: ${parts.join(", ")}`]);
              toast({ title: "Extrapolation Complete", description: `${enriched} of ${evt.total} companies enriched${evt.skipped > 0 ? `, ${evt.skipped} skipped` : ""}` });
              queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Extrapolation failed", description: err.message, variant: "destructive" });
    }
    setExtrapolateRunning(false);
  }, [extrapolateRunning, queryClient, toast]);

  const startDeepLogic64 = useCallback(async (leadIds: string[]) => {
    if (deeplogicRunning || !leadIds.length) return;
    setDeeplogicRunning(true);
    setDeeplogicLog([]);
    setDeeplogicProgress({ current: 0, total: leadIds.length });
    try {
      const res = await fetch("/api/light/deeplogic64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "phase") setDeeplogicLog(p => [...p, evt.message]);
            else if (evt.type === "progress") {
              setDeeplogicProgress({ current: evt.index + 1, total: evt.total });
              setDeeplogicLog(p => [...p, `${evt.phase === "xray" ? "X-Ray" : evt.phase === "gap" ? "Gap Analysis" : "Analyzing"}: ${evt.current}`]);
            } else if (evt.type === "xray") {
              setDeeplogicLog(p => [...p, `${evt.company}: Health ${evt.healthScore}/100, ${formatCurrency(evt.unclaimed)} unclaimed`]);
            } else if (evt.type === "gap") {
              const topGapStr = evt.topGaps?.length ? ` — Top: ${evt.topGaps.map((g: any) => `${g.credit}${g.value ? ` (${formatCurrency(g.value)})` : ''}`).join(', ')}` : '';
              setDeeplogicLog(p => [...p, `[GAP] ${evt.company}: ${evt.creditsScanned} credits scanned, ${evt.gapsFound} gaps${evt.cascadeOpportunities ? `, ${evt.cascadeOpportunities} cascades` : ''}${topGapStr}`]);
            } else if (evt.type === "retro") {
              const yearsStr = evt.amendableYears?.length ? ` (years: ${evt.amendableYears.join(', ')})` : '';
              setDeeplogicLog(p => [...p, `${evt.company}: ${evt.opportunities} retroactive opportunities (${formatCurrency(evt.totalValue)})${yearsStr}`]);
            } else if (evt.type === "trends") {
              const trendStr = evt.insights?.map((t: any) => `${t.metric} (${t.severity})`).join(', ') || '';
              setDeeplogicLog(p => [...p, `[TRENDS] ${evt.company}: ${trendStr}`]);
            } else if (evt.type === "interactions") {
              setDeeplogicLog(p => [...p, `[INTERACTIONS] ${evt.company}: ${evt.count} credit interactions detected`]);
            } else if (evt.type === "footnotes") {
              setDeeplogicLog(p => [...p, `[FOOTNOTES] ${evt.company}: ${evt.count} footnote signals extracted`]);
            } else if (evt.type === "benchmark") {
              const outlierStr = evt.outliers > 0 ? ` — ${evt.outliers} outlier(s)` : '';
              setDeeplogicLog(p => [...p, `[BENCHMARK] ${evt.company}: ${evt.peerCount} peers compared${outlierStr}`]);
            } else if (evt.type === "warning") {
              setDeeplogicLog(p => [...p, `[WARN] ${evt.company}: ${evt.message}`]);
            } else if (evt.type === "error") {
              setDeeplogicLog(p => [...p, `Error: ${evt.company} — ${evt.error}`]);
            } else if (evt.type === "complete") {
              setDeeplogicLog(p => [...p, `DeepLogic64 complete: ${evt.total} companies, ${evt.xrayed} X-Rayed, ${evt.gaps} gaps found, ${evt.retroactive} retroactive${evt.cascades ? `, ${evt.cascades} cascade chains` : ''}`]);
              toast({ title: "DeepLogic64 Complete", description: `${evt.total} companies analyzed — ${evt.gaps} gaps, ${evt.retroactive} retro opportunities` });
              queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "DeepLogic64 failed", description: err.message, variant: "destructive" });
    }
    setDeeplogicRunning(false);
  }, [deeplogicRunning, queryClient, toast]);

  const allocateToPortfolio = useCallback(async (leadIds: string[]) => {
    if (!leadIds.length) return;
    try {
      const res = await apiRequest("POST", "/api/portfolio/allocate", { leadIds });
      const data = await res.json();
      toast({ title: "Allocated to Portfolio", description: `${data.allocated} companies added` });
      setSelectedStage3(new Set());
    } catch (err: any) {
      toast({ title: "Allocation failed", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const startReXray = useCallback(async (force?: boolean) => {
    if (xrayRunning) return;
    setXrayRunning(true);
    setXrayForceMode(!!force);
    setXrayProgress({ scanned: 0, updated: 0, failed: 0, total: 0 });
    setXrayLog([]);

    try {
      const res = await fetch("/api/light/re-xray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force: !!force }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const eventMatch = part.match(/^event: (\w+)\ndata: (.+)$/s);
            if (!eventMatch) continue;
            const [, event, dataStr] = eventMatch;
            try {
              const data = JSON.parse(dataStr);
              if (event === "phase") {
                setXrayLog(prev => [...prev, `${data.phase}: ${data.detail}`]);
                if (data.skippedDead > 0) {
                  setXrayProgress(prev => ({ ...prev, skippedDead: data.skippedDead }));
                }
              } else if (event === "xray") {
                setXrayProgress({ scanned: data.scanned, updated: data.updated, failed: 0, total: data.total });
                const label = data.healthLabel || "Unknown";
                const unclaimed = data.estimatedUnclaimedValue > 0 ? ` · ${formatCurrency(data.estimatedUnclaimedValue)} unclaimed` : "";
                setXrayLog(prev => [...prev, `${data.company}: ${label} (${data.healthScore}/100, ${data.xbrlDepth} concepts${unclaimed})`]);
              } else if (event === "skip") {
                setXrayLog(prev => [...prev, `${data.company}: ${data.reason}`]);
              } else if (event === "error") {
                setXrayLog(prev => [...prev, `${data.company}: ERROR — ${data.error}`]);
              } else if (event === "progress") {
                setXrayProgress({ scanned: data.scanned, updated: data.updated, failed: data.failed, total: data.total, skippedDead: data.skippedDead });
              } else if (event === "complete") {
                setXrayProgress({ scanned: data.scanned, updated: data.updated, failed: data.failed || 0, total: data.total, skippedDead: data.skippedDead });
                const deadNote = data.skippedDead > 0 ? ` · ${data.skippedDead} dead skipped` : "";
                setXrayLog(prev => [...prev, `Complete: ${data.updated} leads x-rayed, ${data.scanned} scanned${deadNote}${data.message ? ` — ${data.message}` : ""}`]);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setXrayLog(prev => [...prev, `Re-X-Ray error: ${err.message}`]);
    } finally {
      setXrayRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
    }
  }, [xrayRunning, queryClient]);

  const startBloom = useCallback(async () => {
    if (!bloomIndustry || bloomRunning) return;
    setBloomRunning(true);
    setBloomPhase("Starting bloom...");
    setBloomProgress({ stored: 0, total: parseInt(bloomCount) || 10, scanned: 0 });
    setBloomLog([]);

    try {
      const res = await fetch("/api/light/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ industry: bloomIndustry, state: bloomState || undefined, count: parseInt(bloomCount) || 10, xbrlGate: bloomXbrlGate, sources: bloomSources, eftsQuery: bloomSources.includes("efts") ? bloomEftsQuery : undefined }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            let event = "message";
            let dataStr = "";
            for (const pLine of part.split("\n")) {
              if (pLine.startsWith("event: ")) event = pLine.slice(7).trim();
              else if (pLine.startsWith("data: ")) dataStr = pLine.slice(6);
            }
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (event === "phase") setBloomPhase(data.detail || data.phase);
              else if (event === "lead") {
                const xbrlTag = data.xbrlDepth > 0 ? `${data.xbrlDepth} XBRL` : "no XBRL";
                const srcTag = data.discoverySource === "formD" ? "Form D" : data.discoverySource === "efts" ? "EFTS" : "SIC";
                const evtTag = data.recentEventCount > 0 ? ` · ${data.recentEventCount} 8-K` : "";
                setBloomLog(prev => [...prev, `${data.company} — ${data.credits} credits · ${xbrlTag} · ${srcTag}${evtTag}`]);
                setBloomProgress(prev => ({ ...prev, stored: data.stored }));
              } else if (event === "progress") {
                setBloomProgress({ stored: data.stored, total: data.total, scanned: data.scanned });
              } else if (event === "skip") {
                setBloomLog(prev => [...prev, `Filtered: ${data.company} — ${data.reason}`]);
              } else if (event === "complete") {
                const parts: string[] = [];
                if (data.scanned) parts.push(`${data.scanned} scanned`);
                if (data.withXbrl > 0 || data.withoutXbrl > 0) parts.push(`${data.withXbrl || 0} XBRL / ${data.withoutXbrl || 0} non-XBRL`);
                if (data.skippedNoXbrl > 0) parts.push(`${data.skippedNoXbrl} filtered no XBRL`);
                if (data.skippedStale > 0) parts.push(`${data.skippedStale} stale`);
                const sc = data.sourceCounts || {};
                const srcParts: string[] = [];
                if (sc.sic) srcParts.push(`SIC:${sc.sic}`);
                if (sc.formD) srcParts.push(`Form D:${sc.formD}`);
                if (sc.efts) srcParts.push(`EFTS:${sc.efts}`);
                if (srcParts.length > 1) parts.push(srcParts.join(" "));
                const qualityLine = parts.length > 0 ? ` · ${parts.join(" · ")}` : "";
                setBloomPhase(`Bloomed ${data.stored} living leads in ${data.industry}${qualityLine}`);
                queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
                toast({ title: `Discovered ${data.stored} living leads`, description: `${data.industry} · ${data.category}${qualityLine}` });
              } else if (event === "error") {
                setBloomLog(prev => [...prev, `Error: ${data.error || data.company}`]);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Bloom failed", description: err.message, variant: "destructive" });
    } finally {
      setBloomRunning(false);
    }
  }, [bloomIndustry, bloomState, bloomCount, bloomXbrlGate, bloomSources, bloomEftsQuery, bloomRunning, queryClient, toast]);

  useEffect(() => {
    if (companySearch.trim().length < 2) {
      setCompanySearchResults([]);
      setCompanySearchOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/light/company-search?q=${encodeURIComponent(companySearch.trim())}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setCompanySearchResults(data.results || []);
          setCompanySearchOpen((data.results || []).length > 0);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [companySearch]);

  const addCompanyFromSearch = useCallback(async (company: { cik: string; ticker: string; title: string }) => {
    setAddingCompany(company.cik);
    try {
      const res = await apiRequest("POST", "/api/light/discover-single", {
        cik: company.cik,
        ticker: company.ticker,
        name: company.title,
      });
      const data = await res.json();
      if (data.alreadyExists) {
        toast({ title: "Already in pipeline", description: `${company.title} is already a lead` });
      } else {
        toast({ title: "Company added", description: `${company.title} (${company.ticker}) added to pipeline` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
      setCompanySearch("");
      setCompanySearchResults([]);
      setCompanySearchOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add company", description: err.message, variant: "destructive" });
    } finally {
      setAddingCompany(null);
    }
  }, [queryClient, toast]);

  const deltaQuery = useQuery<DeltaMap>({ queryKey: ["/api/light/delta"] });
  const industryQuery = useQuery<IndustryTree>({ queryKey: ["/api/light/industries"] });
  const creditsQuery = useQuery<{ credits: Array<{ id: string; name: string; section: string; description: string; maxValue: string; applicableCategories: string[]; neglectLevel: string }> }>({ queryKey: ["/api/light/credits"] });
  const indexStatusQuery = useQuery<{ total: number; enriched: number; financials: number; building: boolean; buildPhase: string; lastBuilt: number }>({
    queryKey: ["/api/gradient/index-status"],
    refetchInterval: (query) => query.state.data?.building ? 5000 : 60000,
  });

  const buildIndexMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gradient/build-index");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gradient/index-status"] });
    },
  });

  const securityQuery = useQuery<SecurityProfile>({
    queryKey: ["/api/light/security", securityDomain],
    enabled: !!securityDomain,
  });

  const saveMutation = useMutation({
    mutationFn: async (params: { leadId: string; channel: string; status: string; message: string; target: string }) => {
      const res = await apiRequest("POST", "/api/light/outreach", params);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
      setShowCashews(true);
      setTimeout(() => setShowCashews(false), 2000);
      toast({ title: "Composition saved" });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (params: { leadId: string; outreachIndex: number; status: string }) => {
      const res = await apiRequest("PATCH", "/api/light/outreach", params);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] }),
  });

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const leads = useMemo(() => {
    if (!deltaQuery.data?.leads) return [];
    let list = [...deltaQuery.data.leads];
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter(l => l.company.toLowerCase().includes(t) || l.domain?.toLowerCase().includes(t));
    }
    if (selectedCategory !== "all") {
      list = list.filter(l => l.industryCategory === selectedCategory);
    }
    if (selectedSubIndustry !== "all") {
      list = list.filter(l => (l.sicDescription || "").toLowerCase().includes(selectedSubIndustry.toLowerCase()));
    }
    if (minCredit) {
      const mc = parseFloat(minCredit) * 1000;
      list = list.filter(l => l.estimatedCreditHigh >= mc);
    }
    if (minRdScore) {
      const ms = parseInt(minRdScore);
      list = list.filter(l => {
        const score = (l as any).rdScore || 0;
        return score >= ms || l.estimatedCreditHigh > 0;
      });
    }
    if (hideDead) {
      list = list.filter(l => l.xbrlDepth > 0);
    }
    if (intelFilter.healthTier) {
      list = list.filter(l => {
        const s = l.creditHealthScore || 0;
        if (intelFilter.healthTier === "creditDesert") return s >= 0 && s <= 20;
        if (intelFilter.healthTier === "underexplored") return s > 20 && s <= 40;
        if (intelFilter.healthTier === "partialCoverage") return s > 40 && s <= 60;
        if (intelFilter.healthTier === "wellManaged") return s > 60 && s <= 80;
        if (intelFilter.healthTier === "fullyOptimized") return s > 80;
        return true;
      });
    }
    if (intelFilter.rateTier) {
      list = list.filter(l => {
        const r = l.effectiveRate;
        if (intelFilter.rateTier === "belowStatutory") return r !== null && r !== undefined && r >= 0 && r < 0.19;
        if (intelFilter.rateTier === "atStatutory") return r !== null && r !== undefined && r >= 0.19 && r <= 0.23;
        if (intelFilter.rateTier === "aboveStatutory") return r !== null && r !== undefined && r > 0.23;
        if (intelFilter.rateTier === "negative") return r !== null && r !== undefined && r < 0;
        return true;
      });
    }
    if (intelFilter.revenueTier) {
      list = list.filter(l => {
        const rev = l.revenue || 0;
        if (intelFilter.revenueTier === "micro") return rev > 0 && rev < 1000000;
        if (intelFilter.revenueTier === "small") return rev >= 1000000 && rev < 10000000;
        if (intelFilter.revenueTier === "mid") return rev >= 10000000 && rev < 100000000;
        if (intelFilter.revenueTier === "large") return rev >= 100000000 && rev < 1000000000;
        if (intelFilter.revenueTier === "enterprise") return rev >= 1000000000;
        return true;
      });
    }
    if (intelFilter.empTier) {
      list = list.filter(l => {
        const emp = l.employeeCount || 0;
        if (intelFilter.empTier === "tiny") return emp > 0 && emp < 50;
        if (intelFilter.empTier === "small") return emp >= 50 && emp < 250;
        if (intelFilter.empTier === "medium") return emp >= 250 && emp < 1000;
        if (intelFilter.empTier === "large") return emp >= 1000 && emp < 10000;
        if (intelFilter.empTier === "enterprise") return emp >= 10000;
        return true;
      });
    }
    if (intelFilter.state) {
      list = list.filter(l => l.state === intelFilter.state);
    }
    if (intelFilter.credit) {
      list = list.filter(l => l.creditAnalysis?.some(c => c.creditId === intelFilter.credit && (c.status === "unclaimed" || c.status === "likely_unclaimed")));
    }
    if (intelFilter.entityType) {
      list = list.filter(l => l.entityType === intelFilter.entityType);
    }
    if (intelFilter.cluster) {
      list = list.filter(l => {
        if (intelFilter.cluster === "high_rd_no_credit") return (l.rdExpense || 0) > 0 && l.creditHealthScore <= 20;
        if (intelFilter.cluster === "above_rate_opportunity") return (l.effectiveRate || 0) > 0.23;
        if (intelFilter.cluster === "nol_shield") return (l.nolCarryforward || 0) > 0;
        if (intelFilter.cluster === "credit_desert_with_revenue") return l.creditHealthScore <= 20 && (l.revenue || 0) > 0;
        if (intelFilter.cluster === "large_unclaimed") return (l.estimatedUnclaimedValue || 0) > 100000;
        return true;
      });
    }
    if (intelFilter.discoverySource) {
      list = list.filter(l => {
        const src = (l as any).enrichmentData?.discoverySource || "sic";
        return src === intelFilter.discoverySource;
      });
    }
    list.sort((a, b) => {
      if (sortBy === "forms") return b.formCount - a.formCount;
      if (sortBy === "ads") return b.adNetworkCount - a.adNetworkCount;
      if (sortBy === "credits") return b.applicableCredits.length - a.applicableCredits.length;
      if (sortBy === "creditHealth") return (a.creditHealthScore || 0) - (b.creditHealthScore || 0);
      if (sortBy === "unclaimed") return (b.estimatedUnclaimedValue || 0) - (a.estimatedUnclaimedValue || 0);
      return a.company.localeCompare(b.company);
    });
    return list;
  }, [deltaQuery.data, sortBy, searchTerm, selectedCategory, selectedSubIndustry, minCredit, minRdScore, hideDead, intelFilter]);

  const stage1Leads = useMemo(() => leads.filter(l => !l.pipelineStage || l.pipelineStage === "discovered"), [leads]);
  const stage2Leads = useMemo(() => leads.filter(l => l.pipelineStage === "extrapolated"), [leads]);
  const stage3Leads = useMemo(() => leads.filter(l => l.pipelineStage === "enriched" || (l as any).deepAnalysisComplete === true), [leads]);
  const recentLeads = useMemo(() => {
    if (!deltaQuery.data?.leads) return [];
    return [...deltaQuery.data.leads].sort((a, b) => {
      const aDate = (a as any).updatedAt || "";
      const bDate = (b as any).updatedAt || "";
      return bDate.localeCompare(aDate);
    }).slice(0, 20);
  }, [deltaQuery.data]);

  const agg = deltaQuery.data?.aggregate;
  const tree = industryQuery.data;

  const bloomIndustryLabel = useMemo(() => {
    if (!bloomIndustry || !tree) return "";
    for (const cat of tree.categories) {
      const found = tree.industries[cat]?.find(ind => ind.key === bloomIndustry);
      if (found) return found.label;
    }
    return bloomIndustry;
  }, [bloomIndustry, tree]);

  if (deltaQuery.isLoading) {
    return (
      <div className="p-8 space-y-8 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Sun className="w-6 h-6 text-amber-300/60" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  const hasLeads = (deltaQuery.data?.leads?.length || 0) > 0;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <GoldenCashews show={showCashews} />
      {showGuide && <HowToGuide onClose={() => setShowGuide(false)} />}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center">
              <Sun className="w-5 h-5 text-amber-300/70" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-amber-100/90" data-testid="text-light-engine-title">Light Engine</h1>
              <p className="text-xs text-amber-400/30">{hasLeads ? "3-Stage Pipeline — Discovery, Extrapolation, Enrichment" : "Tax credit intelligence — start by discovering leads"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasLeads && (
              <Button variant="ghost" size="sm" onClick={() => deltaQuery.refetch()} data-testid="button-refresh-delta"
                className="text-amber-400/40" disabled={deltaQuery.isFetching}>
                {deltaQuery.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sun className="w-3.5 h-3.5" />}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowGuide(g => !g)} data-testid="button-how-to-guide"
              className={showGuide ? "text-amber-300/70" : "text-amber-400/30 hover:text-amber-400/50"}>
              <HelpCircle className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {hasLeads && agg && (
          <p className="text-sm text-amber-300/50" data-testid="text-aggregate-summary">
            {agg.totalForms} {agg.totalForms === 1 ? "form" : "forms"}
            {agg.totalWithAds > 0 && <span> · <Flower2 className="w-3 h-3 inline -mt-0.5" /> {agg.totalAdNetworks} ad {agg.totalAdNetworks === 1 ? "network" : "networks"}</span>}
            <span className="text-amber-400/30"> across {agg.leadsWithXray > 0 ? <span className="text-amber-300/50" data-testid="text-living-count">{agg.leadsWithXray} living</span> : ""}{agg.leadsWithXray > 0 && agg.leadsWithoutXbrl > 0 ? " / " : ""}{agg.leadsWithoutXbrl > 0 ? <span className="text-zinc-500/50" data-testid="text-dead-count">{agg.leadsWithoutXbrl} dormant</span> : ""}{(agg.leadsWithXray === 0 && agg.leadsWithoutXbrl === 0) ? `${agg.totalLeads} leads` : ""}</span>
            {tree && <span className="text-amber-400/20"> · {tree.totalCount} industries</span>}
            {agg.leadsWithXray > 0 && (
              <span className="text-amber-400/25"> · <Radar className="w-3 h-3 inline -mt-0.5" /> {agg.leadsWithXray} x-rayed · avg health {agg.avgCreditHealth}</span>
            )}
            {agg.totalUnclaimedValue > 0 && (
              <span className="text-amber-300/40 font-medium" data-testid="text-total-unclaimed"> · {formatCurrency(agg.totalUnclaimedValue)} unclaimed</span>
            )}
          </p>
        )}

        {hasLeads && agg && (agg.lightCycle.composed + agg.lightCycle.pushed + agg.lightCycle.received > 0) && (
          <div className="flex items-center gap-3 text-xs text-amber-400/40 flex-wrap">
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {agg.lightCycle.composed} composed</span>
            <ArrowRight className="w-2.5 h-2.5 text-amber-400/15" />
            <span className="flex items-center gap-1"><Sun className="w-3 h-3 text-yellow-300/50" /> {agg.lightCycle.pushed} pushed</span>
            <ArrowRight className="w-2.5 h-2.5 text-amber-400/15" />
            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-400/50" /> {agg.lightCycle.received} received</span>
          </div>
        )}

        {hasLeads && agg && agg.leadsWithXray > 0 && (
          <button onClick={() => setShowIntel(prev => !prev)} data-testid="button-toggle-intel"
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${showIntel
              ? "bg-amber-500/10 border-amber-400/20 text-amber-200/70 shadow-sm shadow-amber-500/5"
              : "bg-amber-500/5 border-amber-500/10 text-amber-400/35 hover:bg-amber-500/8 hover:border-amber-400/15 hover:text-amber-400/50"}`}>
            <BarChart3 className="w-4 h-4" />
            <span className="font-medium">{showIntel ? "Hide" : "Show"} Credit Intelligence Dashboard</span>
            <span className="text-[10px] text-amber-400/25 ml-1">{agg.leadsWithXray} x-rayed</span>
            {showIntel ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {showIntel && hasLeads && agg && agg.leadsWithXray > 0 && (
        <IntelDashboard
          agg={agg}
          leads={leads}
          allLeads={deltaQuery.data?.leads || []}
          intelFilter={intelFilter}
          setIntelFilter={setIntelFilter}
          intelTab={intelTab}
          setIntelTab={setIntelTab}
          setExpandedId={setExpandedId}
          credits={creditsQuery.data?.credits || []}
        />
      )}

      {hasLeads && (
        <div className="relative" data-testid="section-company-search-compact">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/40" />
          <Input
            placeholder="Search SEC EDGAR — add a company by name or ticker..."
            value={companySearch}
            onChange={e => setCompanySearch(e.target.value)}
            onFocus={() => companySearchResults.length > 0 && setCompanySearchOpen(true)}
            onBlur={() => setTimeout(() => setCompanySearchOpen(false), 200)}
            className="w-full pl-10 h-10 text-sm bg-amber-500/[0.03] border-amber-500/15 focus:border-amber-400/30 placeholder:text-amber-400/30"
            data-testid="input-company-search-compact"
          />
          {addingCompany && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-amber-400/50" />
          )}
          {companySearchOpen && companySearchResults.length > 0 && (
            <div className="absolute z-20 w-full mt-1 rounded-lg border border-amber-500/15 bg-[#0c0f14] shadow-xl max-h-[280px] overflow-y-auto">
              {companySearchResults.map(c => (
                <button
                  key={c.cik}
                  onClick={() => addCompanyFromSearch(c)}
                  disabled={!!addingCompany}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-500/8 transition-colors disabled:opacity-50"
                  data-testid={`search-result-compact-${c.ticker}`}
                >
                  <span className="text-xs font-mono font-semibold text-amber-300/70 w-14 shrink-0">{c.ticker}</span>
                  <span className="text-sm text-amber-200/60 truncate flex-1">{c.title}</span>
                  {addingCompany === c.cik ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400/40 shrink-0" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-amber-400/20 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={`rounded-xl border bg-gradient-to-br from-amber-950/8 to-amber-900/5 ${hasLeads ? "border-amber-400/8 p-3" : "border-amber-400/15 p-6 space-y-4"}`} data-testid="section-bloom-discovery">
        {!hasLeads && (
          <>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-400/8 border border-amber-400/15 flex items-center justify-center">
                <Flower2 className="w-5 h-5 text-amber-300/60" />
              </div>
              <div>
                <h2 className="text-base font-medium text-amber-200/70">Bloom — Find Your Own Flowers</h2>
                <p className="text-xs text-amber-400/30 mt-0.5">Pick an industry, hit Bloom, and discover companies with unclaimed tax credits</p>
              </div>
            </div>

            {!bloomRunning && bloomLog.length === 0 && (
              <div className="grid grid-cols-3 gap-4 py-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-amber-300/60">1</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-200/60">Pick an industry</p>
                    <p className="text-[11px] text-amber-400/20 mt-0.5">27 categories, 475 sub-industries</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-amber-300/60">2</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-200/60">Hit Bloom</p>
                    <p className="text-[11px] text-amber-400/20 mt-0.5">Discovers companies via SEC EDGAR filings</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/15 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[11px] font-semibold text-amber-300/60">3</span>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-amber-200/60">Browse and reach out</p>
                    <p className="text-[11px] text-amber-400/20 mt-0.5">See credits, check defenses, fill forms</p>
                  </div>
                </div>
              </div>
            )}

            {indexStatusQuery.data && (
              <div className="flex items-center gap-2 py-1.5 px-3 rounded-md border border-amber-500/10 bg-amber-500/[0.03]" data-testid="index-status-indicator">
                {indexStatusQuery.data.building ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400/50" />
                    <span className="text-[10px] text-amber-300/50">
                      Building company index... {indexStatusQuery.data.enriched.toLocaleString()} / {indexStatusQuery.data.total.toLocaleString()} with SIC
                    </span>
                  </>
                ) : indexStatusQuery.data.enriched > 0 ? (
                  <>
                    <Database className="w-3 h-3 text-emerald-400/60" />
                    <span className="text-[10px] text-emerald-300/50">
                      Index ready — {indexStatusQuery.data.enriched.toLocaleString()} companies with SIC data
                    </span>
                  </>
                ) : (
                  <>
                    <Database className="w-3 h-3 text-amber-400/40" />
                    <span className="text-[10px] text-amber-300/40">Index not built</span>
                    <button
                      onClick={() => buildIndexMutation.mutate()}
                      disabled={buildIndexMutation.isPending}
                      className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300/70 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      data-testid="button-build-index"
                    >
                      {buildIndexMutation.isPending ? "Starting..." : "Build Index"}
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="relative" data-testid="section-company-search">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/30" />
                <Input
                  placeholder="Search by company name or ticker..."
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  onFocus={() => companySearchResults.length > 0 && setCompanySearchOpen(true)}
                  onBlur={() => setTimeout(() => setCompanySearchOpen(false), 200)}
                  className="pl-10 h-10 text-sm bg-transparent border-amber-500/15 focus:border-amber-400/30 placeholder:text-amber-400/20"
                  data-testid="input-company-search"
                />
                {addingCompany && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-amber-400/50" />
                )}
              </div>
              {companySearchOpen && companySearchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 rounded-lg border border-amber-500/15 bg-[#0c0f14] shadow-xl max-h-[280px] overflow-y-auto">
                  {companySearchResults.map(c => (
                    <button
                      key={c.cik}
                      onClick={() => addCompanyFromSearch(c)}
                      disabled={!!addingCompany}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-amber-500/8 transition-colors disabled:opacity-50"
                      data-testid={`search-result-${c.ticker}`}
                    >
                      <span className="text-xs font-mono font-semibold text-amber-300/70 w-14 shrink-0">{c.ticker}</span>
                      <span className="text-sm text-amber-200/60 truncate flex-1">{c.title}</span>
                      {addingCompany === c.cik ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400/40 shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400/20 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-amber-500/8" />
              <span className="text-[10px] text-amber-400/20 uppercase tracking-wider">or bloom by industry</span>
              <div className="flex-1 h-px bg-amber-500/8" />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Select value={bloomIndustry} onValueChange={setBloomIndustry} data-testid="select-bloom-industry">
                  <SelectTrigger className="h-10 text-sm bg-transparent text-amber-200/60 border-amber-500/15">
                    <SelectValue placeholder="Pick an industry to bloom..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {tree?.categories.map(cat => {
                      const subs = tree.industries[cat] || [];
                      return (
                        <SelectGroup key={cat}>
                          <SelectLabel className="text-[10px] font-semibold text-amber-300/50 uppercase tracking-wider px-2 py-1.5">{cat}</SelectLabel>
                          {subs.map(ind => (
                            <SelectItem key={ind.key} value={ind.key} className="pl-4">
                              {ind.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Input placeholder="State" value={bloomState} onChange={e => setBloomState(e.target.value)}
                className="w-16 h-10 text-xs bg-transparent border-amber-500/10 placeholder:text-amber-400/15 uppercase"
                maxLength={2} data-testid="input-bloom-state" />
              <div className="flex items-center border border-amber-500/12 rounded-md overflow-hidden">
                {["100", "250", "500"].map(n => (
                  <button key={n} onClick={() => setBloomCount(n)} data-testid={`button-bloom-count-${n}`}
                    className={`px-3 h-10 text-xs font-medium transition-colors ${bloomCount === n ? "bg-amber-500/20 text-amber-100/80" : "text-amber-400/30"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-amber-500/12" data-testid="toggle-xbrl-gate">
                <Switch checked={bloomXbrlGate} onCheckedChange={setBloomXbrlGate} className="scale-75" />
                <span className={`text-[11px] ${bloomXbrlGate ? "text-amber-200/50" : "text-amber-400/30"}`}>XBRL Gate</span>
              </div>
              <Button onClick={startBloom} disabled={!bloomIndustry || bloomRunning} data-testid="button-bloom"
                className="h-10 px-6 text-xs font-medium border border-amber-400/15 bg-amber-500/20 text-amber-100/80">
                {bloomRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Flower2 className="w-3.5 h-3.5 mr-1.5" />}
                {bloomRunning ? "Blooming..." : "Bloom"}
              </Button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-amber-400/25 mr-1">Sources:</span>
              {[
                { id: "sic", label: "SIC Industry" },
                { id: "formD", label: "Form D" },
                { id: "efts", label: "Filing Search" },
              ].map(src => (
                <button key={src.id} data-testid={`source-chip-${src.id}`}
                  onClick={() => setBloomSources(prev => prev.includes(src.id) ? (src.id === "sic" ? prev : prev.filter(s => s !== src.id)) : [...prev, src.id])}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${bloomSources.includes(src.id)
                    ? "bg-amber-500/20 border-amber-400/25 text-amber-200/70"
                    : "bg-transparent border-amber-500/10 text-amber-400/20 hover:border-amber-400/20"}`}>
                  {src.label}
                </button>
              ))}
              {bloomSources.includes("efts") && (
                <Input placeholder="Search query..." value={bloomEftsQuery} onChange={e => setBloomEftsQuery(e.target.value)}
                  className="w-40 h-7 text-[10px] bg-transparent border-amber-500/10 placeholder:text-amber-400/15"
                  data-testid="input-efts-query" />
              )}
            </div>
            {!bloomXbrlGate && (
              <p className="text-[10px] text-amber-400/25 flex items-center gap-1.5">
                <Leaf className="w-3 h-3 text-amber-400/20" />
                XBRL Gate off — companies without structured financial data will be discovered but won't have Credit X-Ray analysis
              </p>
            )}
          </>
        )}

        {hasLeads && (
          <div className="flex items-center gap-2 flex-wrap">
            <Flower2 className="w-3.5 h-3.5 text-amber-300/40 shrink-0" />
            <span className="text-xs text-amber-200/40 shrink-0">Bloom more:</span>
            <Popover open={bloomIndustryOpen} onOpenChange={setBloomIndustryOpen}>
              <PopoverTrigger asChild>
                <button
                  role="combobox"
                  aria-expanded={bloomIndustryOpen}
                  aria-label="Select industry"
                  data-testid="combobox-bloom-industry"
                  className="w-44 h-7 px-2 text-xs text-left bg-transparent border border-amber-500/10 border-dashed rounded-md truncate flex items-center justify-between gap-1 transition-colors"
                >
                  <span className={bloomIndustryLabel ? "text-amber-200/50 truncate" : "text-amber-400/20 truncate"}>
                    {bloomIndustryLabel || "Industry..."}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-amber-400/25 shrink-0 transition-transform ${bloomIndustryOpen ? "rotate-180" : ""}`} />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0 border-amber-500/15" align="start">
                <Command>
                  <CommandInput placeholder="Search industries..." className="h-8 text-xs" data-testid="input-search-bloom-industry" />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty className="py-4 text-xs text-amber-400/30">No industries found</CommandEmpty>
                    {tree?.categories.map(cat => {
                      const subs = tree.industries[cat] || [];
                      return (
                        <CommandGroup key={cat} heading={cat}>
                          {subs.map(ind => (
                            <CommandItem
                              key={ind.key}
                              value={`${ind.label} ${cat}`}
                              onSelect={() => {
                                setBloomIndustry(ind.key);
                                setBloomIndustryOpen(false);
                              }}
                              className="text-xs cursor-pointer"
                              data-testid={`combobox-item-${ind.key}`}
                            >
                              {ind.label}
                              {bloomIndustry === ind.key && <CheckCircle className="w-3 h-3 ml-auto text-amber-400/50" />}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Input placeholder="ST" value={bloomState} onChange={e => setBloomState(e.target.value)}
              className="w-12 h-7 text-[11px] bg-transparent border-amber-500/8 border-dashed placeholder:text-amber-400/15 uppercase"
              maxLength={2} data-testid="input-bloom-state" />
            <div className="flex items-center border border-amber-500/8 border-dashed rounded overflow-hidden">
              {["100", "250", "500"].map(n => (
                <button key={n} onClick={() => setBloomCount(n)} data-testid={`button-bloom-count-${n}`}
                  className={`px-1.5 h-7 text-[10px] font-medium transition-colors ${bloomCount === n ? "bg-amber-500/15 text-amber-200/60" : "text-amber-400/20"}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-2 h-7 rounded border border-amber-500/8 border-dashed" data-testid="toggle-xbrl-gate-compact">
              <Switch checked={bloomXbrlGate} onCheckedChange={setBloomXbrlGate} className="scale-[0.6]" />
              <span className={`text-[9px] ${bloomXbrlGate ? "text-amber-200/40" : "text-amber-400/20"}`}>XBRL</span>
            </div>
            {["formD", "efts"].map(src => (
              <button key={src} data-testid={`source-chip-compact-${src}`}
                onClick={() => setBloomSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src])}
                className={`px-1.5 h-7 rounded text-[9px] font-medium border border-dashed transition-colors ${bloomSources.includes(src)
                  ? "bg-amber-500/15 border-amber-400/20 text-amber-200/60"
                  : "border-amber-500/8 text-amber-400/20"}`}>
                {src === "formD" ? "D" : "EFTS"}
              </button>
            ))}
            <Button onClick={startBloom} disabled={!bloomIndustry || bloomRunning} data-testid="button-bloom"
              size="sm" className="h-7 px-3 text-[11px] border border-amber-400/12 bg-amber-500/10 text-amber-200/60">
              {bloomRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flower2 className="w-3 h-3" />}
            </Button>
            <Separator orientation="vertical" className="h-5 bg-amber-500/8" />
            <Button onClick={(e) => startReXray(e.shiftKey)} disabled={xrayRunning || bloomRunning} data-testid="button-re-xray"
              size="sm" className="h-7 px-3 text-[11px] border border-cyan-400/15 bg-cyan-500/10 text-cyan-200/60"
              title="Shift+click to force rescan all leads">
              {xrayRunning ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Radar className="w-3 h-3 mr-1" />}
              {xrayRunning ? (xrayForceMode ? "Force X-Raying..." : "X-Raying...") : "Re-X-Ray"}
            </Button>
          </div>
        )}

        {(xrayRunning || xrayLog.length > 0) && (
          <div className="rounded-lg border border-cyan-500/10 bg-cyan-950/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radar className={`w-3.5 h-3.5 text-cyan-400/50 ${xrayRunning ? "animate-pulse" : ""}`} />
                <span className="text-xs font-medium text-cyan-300/60">Credit X-Ray Scanner</span>
                {xrayForceMode && <Badge variant="outline" className="text-[9px] border-orange-400/30 text-orange-300/60" data-testid="badge-xray-force">FORCE</Badge>}
              </div>
              {xrayProgress.total > 0 && (
                <span className="text-[11px] text-cyan-400/40 tabular-nums">
                  {xrayProgress.scanned}/{xrayProgress.total} scanned · {xrayProgress.updated} enriched
                  {xrayProgress.failed > 0 && <span className="text-red-400/40"> · {xrayProgress.failed} failed</span>}
                  {(xrayProgress.skippedDead || 0) > 0 && <span className="text-amber-400/30"> · {xrayProgress.skippedDead} dead skipped</span>}
                </span>
              )}
            </div>
            {xrayProgress.total > 0 && (
              <div className="w-full h-1 bg-cyan-950/10 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-400/30 rounded-full transition-all" style={{ width: `${Math.round((xrayProgress.scanned / xrayProgress.total) * 100)}%` }} />
              </div>
            )}
            <div className="max-h-32 overflow-y-auto space-y-0.5 scrollbar-thin">
              {xrayLog.map((line, i) => (
                <p key={i} className="text-[11px] text-cyan-400/30 font-mono leading-relaxed">{line}</p>
              ))}
            </div>
            {!xrayRunning && xrayLog.length > 0 && (
              <button onClick={() => setXrayLog([])} className="text-[10px] text-cyan-400/20 hover:text-cyan-400/40 transition-colors" data-testid="button-clear-xray-log">
                Clear log
              </button>
            )}
          </div>
        )}

        {bloomRunning && (
          <div className={`space-y-2 ${hasLeads ? "mt-3" : ""}`}>
            <div className="flex items-center gap-3 text-xs text-amber-300/40 flex-wrap">
              <Loader2 className="w-3 h-3 animate-spin text-amber-400/40" />
              <span>{bloomPhase}</span>
              <span className="ml-auto tabular-nums">{bloomProgress.stored}/{bloomProgress.total}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-amber-500/5 overflow-hidden">
              <div className="h-full bg-amber-400/30 rounded-full transition-all duration-500"
                style={{ width: `${bloomProgress.total > 0 ? (bloomProgress.stored / bloomProgress.total) * 100 : 0}%` }} />
            </div>
            {bloomLog.length > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-0.5 text-[11px] text-amber-400/25 font-mono">
                {bloomLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        )}
        {!bloomRunning && bloomLog.length > 0 && (
          <div className={`text-xs text-amber-300/30 flex items-center gap-2 ${hasLeads ? "mt-2" : ""}`}>
            <CheckCircle className="w-3 h-3 text-emerald-400/40" />
            <span className="flex-1">{bloomPhase}</span>
            <button onClick={(e) => { e.stopPropagation(); setBloomLog([]); setBloomPhase(""); }}
              className="text-amber-400/15 hover:text-amber-400/30 transition-colors" data-testid="button-clear-bloom-log">
              <XCircle className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {hasLeads && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Select value={selectedCategory} onValueChange={v => { setSelectedCategory(v); setSelectedSubIndustry("all"); }} data-testid="select-industry-category">
                <SelectTrigger className="h-9 text-sm bg-transparent border-amber-500/10 text-amber-200/70">
                  <div className="flex items-center gap-2">
                    <TreePine className="w-3.5 h-3.5 text-amber-400/30" />
                    <SelectValue placeholder="All Industries" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Industries ({tree?.totalCount || 0})</SelectItem>
                  {tree?.categories.map(cat => {
                    const count = tree.industries[cat]?.length || 0;
                    return <SelectItem key={cat} value={cat}>{cat} ({count})</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedCategory !== "all" && tree?.industries[selectedCategory] && (
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedSubIndustry} onValueChange={setSelectedSubIndustry} data-testid="select-sub-industry">
                  <SelectTrigger className="h-9 text-sm bg-transparent border-amber-500/10 text-amber-200/70">
                    <SelectValue placeholder="All sub-industries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All in {selectedCategory}</SelectItem>
                    {tree.industries[selectedCategory].map(ind => (
                      <SelectItem key={ind.key} value={ind.label}>{ind.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400/25" />
              <Input placeholder="Search leads..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-transparent border-amber-500/10 focus:border-amber-500/25 placeholder:text-amber-400/20"
                data-testid="input-search-leads" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Landmark className="w-3 h-3 text-amber-400/25" />
                <Input placeholder="Min $K" value={minCredit} onChange={e => setMinCredit(e.target.value)}
                  className="w-20 h-9 text-xs bg-transparent border-amber-500/10 placeholder:text-amber-400/15"
                  data-testid="input-min-credit" type="number" />
              </div>
            </div>
            <div className="flex items-center border border-amber-500/10 rounded-md overflow-hidden">
              {(["forms", "ads", "credits", "creditHealth", "unclaimed", "company"] as const).map(s => (
                <button key={s} onClick={() => setSortBy(s)} data-testid={`button-sort-${s}`}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${sortBy === s ? "bg-amber-500/15 text-amber-200" : "text-amber-400/30"}`}>
                  {s === "forms" ? "Forms" : s === "ads" ? "Ads" : s === "credits" ? "Credits" : s === "creditHealth" ? "Health" : s === "unclaimed" ? "Unclaimed" : "Name"}
                </button>
              ))}
            </div>
            {agg && agg.leadsWithoutXbrl > 0 && (
              <button onClick={() => setHideDead(prev => !prev)} data-testid="button-hide-dead"
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${hideDead ? "bg-zinc-500/15 border-zinc-400/20 text-zinc-300" : "border-zinc-500/10 text-zinc-500/40"}`}>
                {hideDead ? `${agg.leadsWithoutXbrl} dormant hidden` : `Hide ${agg.leadsWithoutXbrl} dormant`}
              </button>
            )}
          </div>
        </div>
      )}

      {hasLeads && selectedCategory !== "all" && tree?.industries[selectedCategory] && selectedSubIndustry === "all" && (
        <div className="rounded-lg border border-amber-500/6 bg-amber-950/3 p-3">
          <div className="flex items-center gap-2 mb-2">
            <TreePine className="w-3.5 h-3.5 text-amber-400/30" />
            <span className="text-xs font-medium text-amber-300/50">{selectedCategory}</span>
            <span className="text-[11px] text-amber-400/20">{tree.industries[selectedCategory].length} sub-industries</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {tree.industries[selectedCategory].map(ind => (
              <button key={ind.key} onClick={() => setSelectedSubIndustry(ind.label)} data-testid={`button-industry-${ind.key}`}
                className="text-[11px] px-2 py-0.5 rounded border border-amber-500/8 text-amber-400/40 transition-colors">
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasLeads && !bloomRunning && bloomLog.length === 0 && (
        <div className="py-10 text-center space-y-3">
          <Sun className="w-10 h-10 text-amber-400/8 mx-auto" />
          <p className="text-sm text-amber-300/20">Your garden is empty</p>
          <p className="text-xs text-amber-400/12">Pick an industry above and hit Bloom to discover companies with unclaimed tax credits</p>
        </div>
      )}

      {hasLeads && leads.length === 0 && (
        <div className="py-12 text-center space-y-3">
          <Search className="w-8 h-8 text-amber-400/10 mx-auto" />
          <p className="text-sm text-amber-300/25">No leads match your filters</p>
          <p className="text-xs text-amber-400/15">Try adjusting your industry or finance filters</p>
        </div>
      )}

      {hasLeads && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center border border-amber-500/10 rounded-md overflow-hidden">
            <button onClick={() => setPipelineView("stages")} data-testid="button-view-stages"
              className={`px-3 py-1.5 text-xs transition-colors ${pipelineView === "stages" ? "bg-amber-500/15 text-amber-200" : "text-amber-400/30"}`}>
              <Layers className="w-3 h-3 inline mr-1" />Pipeline
            </button>
            <button onClick={() => setPipelineView("all")} data-testid="button-view-all"
              className={`px-3 py-1.5 text-xs transition-colors ${pipelineView === "all" ? "bg-amber-500/15 text-amber-200" : "text-amber-400/30"}`}>
              All ({leads.length})
            </button>
          </div>
          <div className="flex items-center gap-3 ml-auto text-[11px]">
            <span className="text-amber-300/40 flex items-center gap-1"><Flower2 className="w-3 h-3" /> {stage1Leads.length} discovered</span>
            <ArrowRight className="w-3 h-3 text-amber-400/15" />
            <span className="text-cyan-300/40 flex items-center gap-1"><GitBranch className="w-3 h-3" /> {stage2Leads.length} extrapolated</span>
            <ArrowRight className="w-3 h-3 text-amber-400/15" />
            <span className="text-emerald-300/40 flex items-center gap-1"><Brain className="w-3 h-3" /> {stage3Leads.length} enriched</span>
          </div>
        </div>
      )}

      {hasLeads && pipelineView === "stages" && (
        <div className="space-y-6">
          {stage1Leads.length > 0 && (
            <div className="space-y-3" data-testid="section-stage-1">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/15 bg-amber-950/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-400/15 border border-amber-400/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-amber-300/70">I</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-amber-200/70">Discovery</h3>
                    <p className="text-[11px] text-amber-400/30">{stage1Leads.length} companies discovered — ready for mid-level enrichment</p>
                  </div>
                </div>
                <Button onClick={() => startExtrapolate(stage1Leads.map(l => l.leadId))} disabled={extrapolateRunning} data-testid="button-extrapolate"
                  className="h-9 px-5 text-xs font-medium border border-amber-400/20 bg-amber-500/15 text-amber-100/80">
                  {extrapolateRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <GitBranch className="w-3.5 h-3.5 mr-1.5" />}
                  {extrapolateRunning ? "Extrapolating..." : "Extrapolate All"}
                </Button>
              </div>
              {(extrapolateRunning || extrapolateLog.length > 0) && (
                <div className="rounded-lg border border-amber-500/10 bg-amber-950/3 p-3 space-y-2">
                  {extrapolateProgress.total > 0 && (
                    <div className="w-full h-1 bg-amber-950/10 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400/30 rounded-full transition-all" style={{ width: `${Math.round((extrapolateProgress.current / extrapolateProgress.total) * 100)}%` }} />
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {extrapolateLog.map((line, i) => (
                      <p key={i} className={`text-[11px] font-mono ${line.startsWith("[SKIP]") ? "text-zinc-400/50" : line.startsWith("[WARN]") ? "text-yellow-400/60" : line.startsWith("Error:") ? "text-red-400/50" : "text-amber-400/30"}`}>{line}</p>
                    ))}
                  </div>
                  {!extrapolateRunning && <button onClick={() => setExtrapolateLog([])} className="text-[10px] text-amber-400/20 hover:text-amber-400/40" data-testid="button-clear-extrapolate-log">Clear</button>}
                </div>
              )}
              <div className="space-y-1.5">
                {stage1Leads.slice(0, 20).map(lead => (
                  <div key={lead.leadId} className="flex items-center gap-3 px-3 py-2 rounded border border-amber-500/6 bg-card/30 text-xs" data-testid={`stage1-lead-${lead.leadId}`}>
                    <Building2 className="w-3 h-3 text-amber-300/40 shrink-0" />
                    <span className="text-amber-200/70 font-medium truncate flex-1">{lead.company}</span>
                    <span className="text-amber-400/25 truncate w-28">{lead.domain}</span>
                    <span className="text-amber-400/20 w-20 truncate">{lead.sicDescription?.slice(0, 20)}</span>
                    <span className="text-amber-400/20 w-8">{lead.state}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); startExtrapolate([lead.leadId]); }}
                      disabled={extrapolateRunning}
                      className="shrink-0 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300/60 hover:bg-amber-500/20 hover:text-amber-200/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                      data-testid={`button-extrapolate-${lead.leadId}`}
                    >
                      <GitBranch className="w-2.5 h-2.5" />
                      <span className="text-[10px]">Extrapolate</span>
                    </button>
                  </div>
                ))}
                {stage1Leads.length > 20 && <p className="text-[11px] text-amber-400/20 text-center">...and {stage1Leads.length - 20} more</p>}
              </div>
            </div>
          )}

          {stage1Leads.length > 0 && stage2Leads.length > 0 && (
            <div className="flex justify-center"><ArrowDown className="w-5 h-5 text-amber-400/15" /></div>
          )}

          {stage2Leads.length > 0 && (
            <div className="space-y-3" data-testid="section-stage-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-cyan-400/15 bg-cyan-950/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-cyan-400/15 border border-cyan-400/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-cyan-300/70">II</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-cyan-200/70">Extrapolated</h3>
                    <p className="text-[11px] text-cyan-400/30">{stage2Leads.length} companies enriched — select for DeepLogic64 analysis</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedStage2(prev => prev.size === stage2Leads.length ? new Set() : new Set(stage2Leads.map(l => l.leadId)))}
                    className="text-[10px] text-cyan-400/30 hover:text-cyan-400/50 transition-colors" data-testid="button-select-all-stage2">
                    {selectedStage2.size === stage2Leads.length ? "Deselect all" : "Select all"}
                  </button>
                  <Button onClick={() => startDeepLogic64(selectedStage2.size > 0 ? Array.from(selectedStage2) : stage2Leads.map(l => l.leadId))}
                    disabled={deeplogicRunning} data-testid="button-deeplogic64"
                    className="h-9 px-5 text-xs font-medium border border-cyan-400/20 bg-cyan-500/15 text-cyan-100/80">
                    {deeplogicRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Brain className="w-3.5 h-3.5 mr-1.5" />}
                    {deeplogicRunning ? "Analyzing..." : `DeepLogic64${selectedStage2.size > 0 ? ` (${selectedStage2.size})` : ""}`}
                  </Button>
                </div>
              </div>
              {(deeplogicRunning || deeplogicLog.length > 0) && (
                <div className="rounded-lg border border-cyan-500/10 bg-cyan-950/3 p-3 space-y-2">
                  {deeplogicProgress.total > 0 && (
                    <div className="w-full h-1 bg-cyan-950/10 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400/30 rounded-full transition-all" style={{ width: `${Math.round((deeplogicProgress.current / deeplogicProgress.total) * 100)}%` }} />
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {deeplogicLog.map((line, i) => (
                      <p key={i} className={`text-[11px] font-mono ${line.startsWith("[GAP]") ? "text-cyan-300/50" : line.startsWith("[WARN]") ? "text-yellow-400/60" : line.startsWith("Error:") ? "text-red-400/50" : "text-cyan-400/30"}`}>{line}</p>
                    ))}
                  </div>
                  {!deeplogicRunning && <button onClick={() => setDeeplogicLog([])} className="text-[10px] text-cyan-400/20 hover:text-cyan-400/40" data-testid="button-clear-deeplogic-log">Clear</button>}
                </div>
              )}
              <div className="space-y-1.5">
                {stage2Leads.map(lead => (
                  <div key={lead.leadId} className="flex items-center gap-3 px-3 py-2 rounded border border-cyan-500/8 bg-card/30 text-xs cursor-pointer hover:border-cyan-400/20 transition-colors"
                    onClick={() => setExpandedId(expandedId === lead.leadId ? null : lead.leadId)} data-testid={`stage2-lead-${lead.leadId}`}>
                    <input type="checkbox" checked={selectedStage2.has(lead.leadId)}
                      onChange={e => { e.stopPropagation(); setSelectedStage2(prev => { const n = new Set(prev); if (n.has(lead.leadId)) n.delete(lead.leadId); else n.add(lead.leadId); return n; }); }}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-cyan-500/20" data-testid={`checkbox-lead-${lead.leadId}`} />
                    <Building2 className="w-3 h-3 text-cyan-300/40 shrink-0" />
                    <span className="text-cyan-200/70 font-medium truncate flex-1">{lead.company}</span>
                    <span className="text-cyan-400/25 truncate w-24">{lead.domain}</span>
                    {lead.formCount > 0 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/15 text-amber-300/50">{lead.formCount}f</Badge>}
                    {lead.adNetworkCount > 0 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-500/15 text-emerald-300/50">{lead.adNetworkCount} ads</Badge>}
                    {lead.applicableCredits.length > 0 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/15 text-amber-400/50">{lead.applicableCredits.length}cr</Badge>}
                    <ChevronRight className={`w-3 h-3 text-cyan-400/20 transition-transform ${expandedId === lead.leadId ? "rotate-90" : ""}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {stage2Leads.length > 0 && stage3Leads.length > 0 && (
            <div className="flex justify-center"><ArrowDown className="w-5 h-5 text-cyan-400/15" /></div>
          )}

          {stage3Leads.length > 0 && (
            <div className="space-y-3" data-testid="section-stage-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-950/5 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-400/15 border border-emerald-400/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-emerald-300/70">III</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-emerald-200/70">Fully Enriched</h3>
                    <p className="text-[11px] text-emerald-400/30">{stage3Leads.length} companies fully analyzed — select to allocate to Portfolio</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedStage3(prev => prev.size === stage3Leads.length ? new Set() : new Set(stage3Leads.map(l => l.leadId)))}
                    className="text-[10px] text-emerald-400/30 hover:text-emerald-400/50 transition-colors" data-testid="button-select-all-stage3">
                    {selectedStage3.size === stage3Leads.length ? "Deselect all" : "Select all"}
                  </button>
                  <Button onClick={() => allocateToPortfolio(selectedStage3.size > 0 ? Array.from(selectedStage3) : stage3Leads.map(l => l.leadId))}
                    data-testid="button-allocate-portfolio"
                    className="h-9 px-5 text-xs font-medium border border-emerald-400/20 bg-emerald-500/15 text-emerald-100/80">
                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                    Allocate to Portfolio{selectedStage3.size > 0 ? ` (${selectedStage3.size})` : ""}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {(pipelineView === "all" ? leads : stage3Leads.length > 0 ? stage3Leads : stage2Leads.length > 0 ? stage2Leads : leads).map(lead => {
          const expanded = expandedId === lead.leadId;
          const phase = getLightPhase(lead.outreachHistory);
          const hasForms = lead.formCount > 0;
          const hasAds = lead.ads?.adActivity === "active";
          const hasCredits = lead.applicableCredits.length > 0;
          const hasCreditXray = (lead.xbrlDepth || 0) > 0 && (lead.creditAnalysis?.length || 0) > 0;
          const healthScore = Math.max(0, Math.min(100, lead.creditHealthScore || 0));
          const highNeglectCredits = lead.applicableCredits.filter(c => c.neglectLevel === "high");

          return (
            <Card key={lead.leadId} data-testid={`card-light-lead-${lead.leadId}`} data-lead-id={lead.leadId}
              className={`transition-all cursor-pointer border bg-card/40 border-amber-500/10 hover:border-amber-400/20 hover:bg-card/60 ${expanded ? "border-amber-400/25 bg-card/60" : ""}`}
              onClick={() => setExpandedId(expanded ? null : lead.leadId)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Building2 className="w-4 h-4 shrink-0 text-amber-300/50" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground/90 truncate">{lead.company}</span>
                        {lead.xbrlDepth === 0 && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500/50 border border-zinc-500/10" data-testid={`badge-no-xbrl-${lead.leadId}`}>No XBRL</span>
                        )}
                        {(() => {
                          const src = (lead as any).enrichmentData?.discoverySource || (lead as any).discoverySource;
                          const evtCount = (lead as any).enrichmentData?.recentEvents?.length || 0;
                          return (
                            <>
                              {src && src !== "sic" && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${src === "formD" ? "bg-violet-500/10 text-violet-400/60 border-violet-500/15" : "bg-cyan-500/10 text-cyan-400/60 border-cyan-500/15"}`} data-testid={`badge-source-${lead.leadId}`}>
                                  {src === "formD" ? "Form D" : "EFTS"}
                                </span>
                              )}
                              {evtCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/60 border border-orange-500/15" data-testid={`badge-events-${lead.leadId}`}>
                                  {evtCount} 8-K
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {lead.industryCategory && (
                          <span className="text-[10px] text-amber-400/25 truncate hidden sm:inline">{lead.industryCategory}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {lead.domain && <span className="text-xs text-amber-400/30">{lead.domain}</span>}
                        {highNeglectCredits.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {highNeglectCredits.slice(0, 3).map((c, ci) => (
                              <Badge key={ci} variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400/20 text-amber-300/60 bg-amber-500/5">
                                <Coins className="w-2 h-2 mr-0.5 inline" />{c.section.replace("IRC ", "")}
                              </Badge>
                            ))}
                            {highNeglectCredits.length > 3 && (
                              <span className="text-[9px] text-amber-400/25">+{highNeglectCredits.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      {hasForms && (
                        <span className="text-amber-300/50">
                          <span className="font-semibold text-amber-200/70 tabular-nums">{lead.formCount}</span>f
                        </span>
                      )}
                      {hasAds && (
                        <span className="text-emerald-400/50 flex items-center gap-0.5">
                          <Flower2 className="w-2.5 h-2.5" /><span className="tabular-nums">{lead.adNetworkCount}</span>
                        </span>
                      )}
                      {hasCredits && (
                        <span className="text-amber-400/50 flex items-center gap-0.5">
                          <Coins className="w-2.5 h-2.5" /><span className="tabular-nums">{lead.applicableCredits.length}</span>
                        </span>
                      )}
                      {hasCreditXray && (
                        <span data-testid={`badge-health-${lead.leadId}`} className={`text-[10px] px-1.5 py-0 rounded font-medium tabular-nums ${
                          healthScore <= 20 ? "text-amber-200 bg-amber-500/20" :
                          healthScore <= 40 ? "text-amber-300/80 bg-amber-500/12" :
                          healthScore <= 60 ? "text-yellow-300/70 bg-yellow-500/10" :
                          healthScore <= 80 ? "text-lime-300/70 bg-lime-500/10" :
                          "text-emerald-300/70 bg-emerald-500/10"
                        }`}>
                          {healthScore}
                        </span>
                      )}
                      {lead.estimatedUnclaimedValue > 0 && (
                        <span data-testid={`text-unclaimed-${lead.leadId}`} className="text-[10px] text-amber-300/50 font-medium tabular-nums">
                          {formatCurrency(lead.estimatedUnclaimedValue)}
                        </span>
                      )}
                    </div>

                    {lead.domain && (
                      <button onClick={e => { e.stopPropagation(); setSecurityDomain(lead.domain); }} data-testid={`button-security-${lead.leadId}`}
                        className="text-zinc-500/30 hover:text-zinc-400/50 transition-colors" title="Check defenses before approach">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {phase.output + phase.light + phase.input > 0 && (
                      <div className="flex items-center gap-0.5">
                        <div className={`w-2 h-2 rounded-full ${phase.output > 0 ? "bg-amber-400/50" : "bg-muted/15"}`} />
                        <div className={`w-2.5 h-2.5 rounded-full ${phase.light > 0 ? "bg-yellow-300/50" : "bg-muted/15"}`} />
                        <div className={`w-2 h-2 rounded-full ${phase.input > 0 ? "bg-emerald-400/50" : "bg-muted/15"}`} />
                      </div>
                    )}

                    <ChevronRight className={`w-3.5 h-3.5 text-amber-400/20 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 space-y-4" onClick={e => e.stopPropagation()}>

                    {(hasCredits || hasCreditXray) && (
                      <div className="rounded-lg border border-amber-400/10 bg-amber-950/5 p-4 space-y-3" data-testid={`section-credits-${lead.leadId}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Coins className="w-3.5 h-3.5 text-amber-400/50" />
                            <span className="text-xs font-medium text-amber-300/60">Credit X-Ray</span>
                            {hasCreditXray && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/15 text-amber-400/40" data-testid={`badge-xbrl-depth-${lead.leadId}`}>
                                <Radar className="w-2 h-2 mr-0.5 inline" />{lead.xbrlDepth} XBRL concepts
                              </Badge>
                            )}
                          </div>
                          {lead.estimatedUnclaimedValue > 0 && (
                            <span className="text-sm font-semibold text-amber-200/70 tabular-nums" data-testid={`text-unclaimed-detail-${lead.leadId}`}>
                              {formatCurrency(lead.estimatedUnclaimedValue)} unclaimed
                            </span>
                          )}
                        </div>

                        {hasCreditXray && (
                          <div className="flex items-center gap-3 px-3 py-2 rounded bg-amber-950/5 border border-amber-500/5">
                            <div className="flex items-center gap-2 flex-1">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                                healthScore <= 20 ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" :
                                healthScore <= 40 ? "bg-amber-500/12 text-amber-300/80" :
                                healthScore <= 60 ? "bg-yellow-500/10 text-yellow-300/70" :
                                healthScore <= 80 ? "bg-lime-500/10 text-lime-300/70" :
                                "bg-emerald-500/10 text-emerald-300/70"
                              }`} data-testid={`gauge-health-${lead.leadId}`}>
                                {healthScore}
                              </div>
                              <div>
                                <div className={`text-xs font-medium ${
                                  healthScore <= 20 ? "text-amber-200" :
                                  healthScore <= 40 ? "text-amber-300/80" :
                                  healthScore <= 60 ? "text-yellow-300/70" :
                                  healthScore <= 80 ? "text-lime-300/70" :
                                  "text-emerald-300/70"
                                }`} data-testid={`text-health-label-${lead.leadId}`}>{lead.creditHealthLabel}</div>
                                <div className="text-[10px] text-amber-400/25">Credit Health Score</div>
                              </div>
                            </div>
                            <div className="w-24 h-1.5 bg-amber-950/10 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${
                                healthScore <= 20 ? "bg-amber-400/60" :
                                healthScore <= 40 ? "bg-amber-400/40" :
                                healthScore <= 60 ? "bg-yellow-400/40" :
                                healthScore <= 80 ? "bg-lime-400/40" :
                                "bg-emerald-400/40"
                              }`} style={{ width: `${healthScore}%` }} />
                            </div>
                          </div>
                        )}

                        {lead.taxPositionSummary && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid={`section-tax-position-${lead.leadId}`}>
                            {lead.taxPositionSummary.effectiveRate !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Effective Rate</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{(lead.taxPositionSummary.effectiveRate * 100).toFixed(1)}%</div>
                                {lead.taxPositionSummary.rateGap !== null && (
                                  <div className="text-[9px] text-amber-400/20">vs {(lead.taxPositionSummary.statutoryRate * 100).toFixed(0)}% statutory ({lead.taxPositionSummary.rateGap > 0 ? "-" : "+"}{Math.abs(lead.taxPositionSummary.rateGap * 100).toFixed(1)}%)</div>
                                )}
                              </div>
                            )}
                            {lead.taxPositionSummary.cashTaxRate !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Cash Tax Rate</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{(lead.taxPositionSummary.cashTaxRate * 100).toFixed(1)}%</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.rdIntensity !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">R&D Intensity</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{(lead.taxPositionSummary.rdIntensity * 100).toFixed(1)}%</div>
                                {lead.taxPositionSummary.rdExpenseAmount !== null && (
                                  <div className="text-[9px] text-amber-400/20">{formatCurrency(lead.taxPositionSummary.rdExpenseAmount)} R&D spend</div>
                                )}
                              </div>
                            )}
                            {lead.taxPositionSummary.nolCarryforward !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">NOL Carryforward</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{formatCurrency(lead.taxPositionSummary.nolCarryforward)}</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.valuationAllowanceRatio !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">VA Ratio</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{(lead.taxPositionSummary.valuationAllowanceRatio * 100).toFixed(0)}%</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.creditDensity !== null && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Credit Density</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{(lead.taxPositionSummary.creditDensity * 100).toFixed(2)}%</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.employeeCount !== null && lead.taxPositionSummary.employeeCount > 0 && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Employees</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{lead.taxPositionSummary.employeeCount.toLocaleString()}</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.capex !== null && lead.taxPositionSummary.capex > 0 && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Annual Capex</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{formatCurrency(lead.taxPositionSummary.capex)}</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.ppeNet !== null && lead.taxPositionSummary.ppeNet > 0 && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Net PP&E</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{formatCurrency(lead.taxPositionSummary.ppeNet)}</div>
                              </div>
                            )}
                            {lead.taxPositionSummary.goodwill !== null && lead.taxPositionSummary.goodwill > 0 && (
                              <div className="px-2 py-1.5 rounded bg-amber-950/3 border border-amber-500/5">
                                <div className="text-[10px] text-amber-400/25">Goodwill</div>
                                <div className="text-xs text-amber-200/60 font-medium tabular-nums">{formatCurrency(lead.taxPositionSummary.goodwill)}</div>
                                <div className="text-[9px] text-amber-400/20">acquisition activity</div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-1">
                          {hasCreditXray ? lead.creditAnalysis.map((ca: any, ci: number) => {
                            const stColors: Record<string, string> = {
                              active: "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/8",
                              partial: "text-yellow-300/70 border-yellow-500/20 bg-yellow-500/8",
                              maxed_out: "text-emerald-400/60 border-emerald-500/15 bg-emerald-500/6",
                              confirmed_unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/12 animate-pulse",
                              likely_unclaimed: "text-amber-300/70 border-amber-500/20 bg-amber-500/8",
                              unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/10 animate-pulse",
                              data_gap: "text-zinc-400/60 border-zinc-500/20 bg-zinc-500/8",
                              structurally_limited: "text-orange-300/70 border-orange-500/20 bg-orange-500/8",
                              dropped: "text-red-300/70 border-red-500/20 bg-red-500/8",
                              peer_outlier: "text-violet-300/70 border-violet-500/20 bg-violet-500/8",
                              unknown: "text-zinc-400/50 border-zinc-500/15",
                            };
                            const stLabels: Record<string, string> = {
                              active: "Actively Claimed", partial: "Partially Utilized", maxed_out: "Fully Optimized",
                              confirmed_unclaimed: "Confirmed Unclaimed", likely_unclaimed: "Likely Unclaimed",
                              unclaimed: "Unclaimed", data_gap: "Insufficient Data",
                              structurally_limited: "Structurally Limited", dropped: "Recently Dropped",
                              peer_outlier: "Industry Outlier", unknown: "Under Review",
                            };
                            const stIcons: Record<string, any> = {
                              active: CheckCircle, partial: MinusCircle, maxed_out: CheckCircle,
                              confirmed_unclaimed: AlertTriangle, likely_unclaimed: Sparkles,
                              unclaimed: Sparkles, data_gap: HelpCircle,
                              structurally_limited: Lock, dropped: ArrowDownCircle,
                              peer_outlier: BarChart3, unknown: HelpCircle,
                            };
                            const StatusIcon = stIcons[ca.status] || Sparkles;
                            const ed = ca.evidenceDetails || {};
                            const hasDetails = ca.classificationReason || ed.footnoteExcerpt || ed.trendInsight || ed.peerContext || ed.interactionWarning;
                            const creditKey = `${lead.leadId}-${ci}`;
                            const isExpanded = expandedCredits.has(creditKey);
                            return (
                              <div key={ci} data-testid={`credit-analysis-${lead.leadId}-${ca.creditId}`}>
                                <div
                                  className={`flex items-center gap-3 py-2 px-3 rounded border border-amber-500/5 bg-amber-950/3 ${hasDetails ? "cursor-pointer hover:bg-amber-950/8 transition-colors" : ""}`}
                                  onClick={() => hasDetails && toggleCreditExpand(creditKey)}
                                >
                                  <StatusIcon className={`w-3 h-3 shrink-0 ${ca.status === "active" || ca.status === "maxed_out" ? "text-emerald-400/60" : ca.status === "structurally_limited" ? "text-orange-400/60" : ca.status === "dropped" ? "text-red-400/60" : ca.status === "peer_outlier" ? "text-violet-400/60" : ca.status === "data_gap" ? "text-zinc-400/40" : "text-amber-300/60"}`} />
                                  <span className="text-xs text-amber-200/60 font-medium flex-1 truncate">{ca.creditName}</span>
                                  <span className="text-[10px] text-amber-400/30 font-mono">{ca.section}</span>
                                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${stColors[ca.status] || stColors.unknown}`}>
                                    {stLabels[ca.status] || ca.status?.replace(/_/g, " ")}
                                  </Badge>
                                  {ca.confidence === "xbrl_verified" && (
                                    <span className="text-[9px] text-emerald-400/40 flex items-center gap-0.5"><CheckCircle className="w-2 h-2" />XBRL</span>
                                  )}
                                  {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/50 tabular-nums">{formatCurrency(ca.potentialAmount)}</span>}
                                  {hasDetails && (isExpanded ? <ChevronDown className="w-3 h-3 text-amber-400/30" /> : <ChevronRight className="w-3 h-3 text-amber-400/20" />)}
                                </div>
                                {isExpanded && hasDetails && (
                                  <div className="ml-6 mr-2 mt-1 mb-2 space-y-2 border-l-2 border-amber-500/10 pl-3">
                                    {ca.classificationReason && (
                                      <div className="flex items-start gap-2">
                                        <Info className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/40" />
                                        <p className="text-[11px] text-amber-200/50 leading-relaxed">{ca.classificationReason}</p>
                                      </div>
                                    )}
                                    {ca.evidence && (
                                      <div className="flex items-start gap-2">
                                        <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-amber-400/25" />
                                        <p className="text-[11px] text-amber-400/30 leading-relaxed">{ca.evidence}</p>
                                      </div>
                                    )}
                                    {ed.footnoteExcerpt && (
                                      <div className="rounded bg-amber-950/5 border border-amber-500/5 p-2">
                                        <div className="text-[10px] text-amber-300/40 font-medium mb-0.5">10-K Footnote</div>
                                        <p className="text-[10px] text-amber-400/30 leading-relaxed italic">"{ed.footnoteExcerpt}"</p>
                                      </div>
                                    )}
                                    {ed.trendInsight && (
                                      <div className="flex items-start gap-2">
                                        <TrendingUp className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                                        <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.trendInsight}</p>
                                      </div>
                                    )}
                                    {ed.peerContext && (
                                      <div className="flex items-start gap-2">
                                        <BarChart3 className="w-3 h-3 shrink-0 mt-0.5 text-violet-400/40" />
                                        <p className="text-[11px] text-violet-300/50 leading-relaxed">{ed.peerContext}</p>
                                      </div>
                                    )}
                                    {ed.interactionWarning && (
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-orange-400/40" />
                                        <p className="text-[11px] text-orange-300/50 leading-relaxed">{ed.interactionWarning}</p>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-3">
                                      {ca.claimedAmount > 0 && <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums">{formatCurrency(ca.claimedAmount)} claimed</span>}
                                      {ca.potentialAmount > 0 && <span className="text-[10px] text-amber-300/60 font-medium tabular-nums">{formatCurrency(ca.potentialAmount)} potential</span>}
                                      {ca.confidence && <span className="text-[9px] text-amber-400/20">{ca.confidence === "xbrl_verified" ? "XBRL Verified" : ca.confidence === "footnote_confirmed" ? "Footnote Confirmed" : ca.confidence}</span>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }) : lead.applicableCredits.map((c, ci) => (
                            <div key={ci} className="flex items-center gap-3 py-1.5 px-3 rounded border border-amber-500/5 bg-amber-950/3">
                              <Sparkles className={`w-3 h-3 shrink-0 ${c.neglectLevel === "high" ? "text-amber-300/60" : c.neglectLevel === "medium" ? "text-amber-400/40" : "text-amber-500/25"}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-amber-200/60 font-medium">{c.name}</span>
                                  <span className="text-[10px] text-amber-400/30 font-mono">{c.section}</span>
                                </div>
                                <span className="text-[11px] text-amber-400/25">{c.maxValue}</span>
                              </div>
                              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${NEGLECT_COLORS[c.neglectLevel]}`}>
                                {c.neglectLevel === "high" ? "overlooked" : c.neglectLevel === "medium" ? "underused" : "known"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {((lead as any).enrichmentData?.tenKFilingHistory?.length > 0) && (
                      <div className="rounded-lg border border-blue-500/10 bg-blue-950/5 p-4 space-y-2" data-testid={`section-filings-${lead.leadId}`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-blue-400/50" />
                          <span className="text-xs font-medium text-blue-300/60">10-K Filing History</span>
                          <span className="text-[10px] text-blue-400/30">{((lead as any).enrichmentData.tenKFilingHistory as any[]).length} filings</span>
                        </div>
                        <div className="space-y-1">
                          {((lead as any).enrichmentData.tenKFilingHistory as Array<{ form: string; filingDate: string; accessionNumber: string }>).map((filing, fi) => {
                            const cikNum = ((lead as any).enrichmentData?.cik || "").replace(/^0+/, "");
                            const accNoDashes = filing.accessionNumber.replace(/-/g, "");
                            const filingYear = filing.filingDate.slice(0, 4);
                            const threeYearsAgo = new Date();
                            threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
                            const inAmendmentWindow = new Date(filing.filingDate) >= threeYearsAgo;
                            return (
                              <div key={fi} className={`flex items-center gap-3 py-1.5 px-3 rounded border ${inAmendmentWindow ? "border-blue-400/15 bg-blue-950/8" : "border-blue-500/5 bg-blue-950/3"}`}>
                                <span className={`text-xs font-mono w-10 ${inAmendmentWindow ? "text-blue-300/70 font-semibold" : "text-blue-400/40"}`}>{filingYear}</span>
                                <span className="text-[10px] text-blue-400/40">{filing.filingDate}</span>
                                <span className="text-[10px] text-blue-400/25">{filing.form}</span>
                                {inAmendmentWindow && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-300/60">amendable</span>}
                                <a
                                  href={`https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNoDashes}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-blue-400/40 hover:text-blue-300/70 ml-auto"
                                  data-testid={`link-filing-${lead.leadId}-${fi}`}
                                >
                                  SEC →
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {((lead as any).enrichmentData?.recentEvents?.length > 0) && (
                      <div className="rounded-lg border border-orange-500/10 bg-orange-950/5 p-4 space-y-2" data-testid={`section-events-${lead.leadId}`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-orange-400/50" />
                          <span className="text-xs font-medium text-orange-300/60">Recent 8-K Events</span>
                          <span className="text-[10px] text-orange-400/30">{(lead as any).enrichmentData.recentEvents.length} filings</span>
                        </div>
                        <div className="space-y-1">
                          {((lead as any).enrichmentData.recentEvents as { type: string; date: string; signal: string; creditRelevance: string[] }[]).slice(0, 5).map((evt, ei) => (
                            <div key={ei} className="flex items-center gap-3 py-1.5 px-3 rounded border border-orange-500/5 bg-orange-950/3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-orange-200/60 font-medium">{evt.signal}</span>
                                  <span className="text-[10px] text-orange-400/30">{evt.date}</span>
                                </div>
                                {evt.creditRelevance.length > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {evt.creditRelevance.slice(0, 3).map((cr, cri) => (
                                      <span key={cri} className="text-[9px] text-orange-400/40">{cr.replace(/_/g, " ")}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span className="text-[9px] text-orange-400/25 font-mono shrink-0">{evt.type || "8-K"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hasAds && (
                      <div className="rounded-lg border border-emerald-500/8 bg-emerald-950/5 p-4 space-y-3" data-testid={`section-ads-${lead.leadId}`}>
                        <div className="flex items-center gap-2">
                          <Flower2 className="w-3.5 h-3.5 text-emerald-400/50" />
                          <span className="text-xs font-medium text-emerald-300/60">Ad Garden</span>
                        </div>
                        {lead.ads.adNetworks.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {lead.ads.adNetworks.map((net, i) => (
                              <Badge key={i} variant="outline"
                                className={`text-[11px] px-2 py-0.5 bg-transparent ${AD_NETWORK_COLORS[net] || "text-emerald-400/50 border-emerald-500/15"}`}>
                                {net}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {lead.ads.trackingPixels.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] text-emerald-400/30 flex items-center gap-1"><Radio className="w-2.5 h-2.5" /> Tracking pixels</span>
                            {lead.ads.trackingPixels.map((p, pi) => (
                              <div key={pi} className="flex items-center gap-3 py-1 px-3 rounded bg-emerald-950/3 border border-emerald-500/5">
                                <span className="text-xs text-emerald-300/50 w-28 truncate">{p.platform}</span>
                                <span className="text-[11px] text-emerald-400/25 font-mono truncate">{p.id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {lead.ads.adsExchanges.length > 0 && (
                          <div className="space-y-1 pt-1">
                            <span className="text-[11px] text-emerald-400/30 flex items-center gap-1"><ArrowRightLeft className="w-2.5 h-2.5" /> Ad exchanges</span>
                            {lead.ads.adsExchanges.map((ex, ei) => (
                              <div key={ei} className="flex items-center gap-3 py-1 px-3 rounded bg-emerald-950/3 border border-emerald-500/5">
                                <span className="text-xs text-emerald-300/50 truncate flex-1">{ex.exchange}</span>
                                {ex.publisherId && <span className="text-[11px] text-emerald-400/20 font-mono">{ex.publisherId}</span>}
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${ex.relationship === "DIRECT" ? "text-emerald-300/50 border-emerald-500/15" : "text-zinc-400/40 border-zinc-500/10"}`}>
                                  {ex.relationship}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {lead.forms.length > 0 ? lead.forms.map((form, i) => (
                      <div key={i} data-testid={`card-form-${lead.leadId}-${i}`}
                        className="rounded-lg border border-amber-500/8 bg-amber-950/5 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-amber-500/15 text-amber-300/60 shrink-0">
                              {FORM_LABELS[form.classification] || "Other"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-amber-500/10 text-amber-400/40 shrink-0">
                              {form.method}
                            </Badge>
                            {form.qualityScore != null && (
                              <Badge variant="outline" data-testid={`badge-quality-${lead.leadId}-${i}`}
                                className={`text-[9px] px-1.5 py-0 shrink-0 ${
                                  form.qualityScore >= 70 ? "border-emerald-500/20 text-emerald-300/60" :
                                  form.qualityScore >= 40 ? "border-amber-500/15 text-amber-300/50" :
                                  "border-zinc-500/10 text-zinc-400/40"
                                }`}>
                                {form.qualityScore >= 70 ? "◆◆◆" : form.qualityScore >= 40 ? "◆◆" : "◆"} Q{form.qualityScore}
                              </Badge>
                            )}
                            {form.classificationConfidence != null && form.classificationConfidence < 60 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-rose-500/15 text-rose-300/40 shrink-0">
                                low conf
                              </Badge>
                            )}
                            <span className="text-xs text-amber-300/40 font-mono truncate">{form.action}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => { navigator.clipboard.writeText(form.action); toast({ title: "URL copied" }); }}
                              className="text-amber-400/20 hover:text-amber-400/40 transition-colors" data-testid={`button-copy-form-${i}`}>
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {form.source && form.source !== form.action && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-400/20">
                            <Globe2 className="w-3 h-3" />
                            <span>Found on {form.source}</span>
                          </div>
                        )}
                        {form.fields.length > 0 && (
                          <div className="space-y-1">
                            {form.fields.map((f, fi) => {
                              const isTextarea = f.tag?.toUpperCase() === "TEXTAREA";
                              const fType = isTextarea ? "textarea" : f.tag?.toUpperCase() === "SELECT" ? "select" : f.type || "text";
                              const Icon = FIELD_ICONS[fType.toLowerCase()] || Type;
                              return (
                                <div key={fi} className="flex items-center gap-3 py-1.5 px-3 rounded bg-amber-950/3 border border-amber-500/5">
                                  <Icon className="w-3 h-3 text-amber-400/20 shrink-0" />
                                  <span className="text-xs text-amber-200/60 font-mono w-28 truncate">{f.name || "(unnamed)"}</span>
                                  <span className="text-[11px] text-amber-400/25">{fType}</span>
                                  {f.placeholder && <span className="text-[11px] text-amber-400/15 truncate">"{f.placeholder}"</span>}
                                  {f.required && <span className="text-[11px] text-red-400/40 ml-auto">required</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {form.fieldCount === 0 && <p className="text-xs text-amber-400/20 italic">Contact form detected — fields not yet scanned</p>}
                        {form.hiddenFields.length > 0 && (
                          <div className="pt-2 border-t border-amber-500/5 space-y-1">
                            <span className="text-[11px] text-amber-400/20 flex items-center gap-1"><Lock className="w-2.5 h-2.5" /> Hidden fields</span>
                            {form.hiddenFields.map((h, hi) => (
                              <div key={hi} className="flex items-center gap-3 py-1 px-3 text-[11px]">
                                <Shield className="w-2.5 h-2.5 text-zinc-500/25 shrink-0" />
                                <span className="text-zinc-400/40 font-mono">{h.name}</span>
                                {h.value && <span className="text-zinc-500/20 font-mono truncate">{h.value}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="py-4 text-center">
                        <p className="text-xs text-amber-400/20">
                          {hasAds || hasCredits ? "No forms yet — but opportunities are blooming" : "No forms or ads discovered — run a scan on this lead"}
                        </p>
                      </div>
                    )}

                    {lead.forms.length > 1 && (
                      <Button variant="ghost" size="sm" data-testid={`button-quantum-forward-${lead.leadId}`}
                        onClick={() => {
                          const summary = lead.forms.map((f, i) => `${i + 1}. ${f.action} (${FORM_LABELS[f.classification] || "Other"})`).join("\n");
                          saveMutation.mutate({ leadId: lead.leadId, channel: "quantum-form", status: "composed",
                            message: `Quantum Forward — ${lead.formCount} forms\n\n${summary}`, target: lead.domain || lead.company });
                        }}
                        className="w-full text-xs text-amber-300/40 h-8">
                        <Zap className="w-3 h-3 mr-1.5" /> Quantum Forward — all {lead.formCount} forms
                      </Button>
                    )}

                    {lead.outreachHistory?.length > 0 && (
                      <div className="pt-3 border-t border-amber-500/5 space-y-2">
                        <span className="text-[11px] text-amber-400/25">Outreach history</span>
                        {lead.outreachHistory.map((h: any, i: number) => (
                          <div key={i} className="flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              {h.status === "composed" && <Eye className="w-3 h-3 text-amber-400/30 shrink-0" />}
                              {h.status === "pushed" && <Send className="w-3 h-3 text-yellow-400/40 shrink-0" />}
                              {h.status === "exchanged" && <Sun className="w-3 h-3 text-yellow-300/50 shrink-0" />}
                              {h.status === "received" && <CheckCircle className="w-3 h-3 text-emerald-400/40 shrink-0" />}
                              <span className="text-amber-300/30 truncate">{h.target}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-amber-400/25">{h.status}</span>
                              {h.status !== "received" && (
                                <button data-testid={`button-advance-${lead.leadId}-${i}`}
                                  className="text-amber-400/20 hover:text-amber-400/40 transition-colors"
                                  onClick={() => {
                                    const next = h.status === "composed" ? "pushed" : h.status === "pushed" ? "exchanged" : "received";
                                    advanceMutation.mutate({ leadId: lead.leadId, outreachIndex: i, status: next });
                                  }}>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasLeads && recentLeads.length > 0 && (
        <div className="rounded-lg border border-zinc-500/8 bg-zinc-950/3 p-4 space-y-3 mt-6" data-testid="section-recent-results">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-zinc-400/40" />
            <span className="text-xs font-medium text-zinc-300/50">Recent Results</span>
            <span className="text-[10px] text-zinc-500/30">Last {recentLeads.length} companies processed</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {recentLeads.slice(0, 20).map(lead => (
              <div key={lead.leadId} className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-500/6 text-[11px]">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  lead.pipelineStage === "enriched" ? "bg-emerald-400/60" :
                  lead.pipelineStage === "extrapolated" ? "bg-cyan-400/60" :
                  "bg-amber-400/40"
                }`} />
                <span className="text-zinc-300/50 truncate">{lead.company}</span>
                {lead.creditHealthScore > 0 && <span className="text-zinc-500/30 tabular-nums ml-auto">{lead.creditHealthScore}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <SecurityDialog
        securityDomain={securityDomain}
        securityQuery={securityQuery}
        setSecurityDomain={setSecurityDomain}
      />
    </div>
  );
}
