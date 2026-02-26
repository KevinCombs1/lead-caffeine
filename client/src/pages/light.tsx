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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import {
  Sun, Building2, ChevronRight, ChevronDown, Copy, CheckCircle, Send,
  Zap, ArrowRight, Loader2, Search, Eye,
  Lock, Globe2, Pencil, MessageSquare, Calendar,
  Shield, Type, AtSign, Phone, Hash, LayoutGrid,
  Flower2, Radio, ArrowRightLeft,
  ShieldCheck, ShieldAlert, Bot, Bug, Radar, Activity,
  Coins, Sparkles, TreePine, Landmark,
  Rocket, User, Mail, Briefcase, XCircle, MinusCircle, PauseCircle, Leaf,
} from "lucide-react";

interface FormField {
  tag?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  value?: string;
}

interface DiscoveredForm {
  action: string;
  method: string;
  fields: FormField[];
  hiddenFields: FormField[];
  fieldCount: number;
  hiddenFieldCount: number;
  classification: string;
  source: string;
}

interface AdIntel {
  adNetworks: string[];
  trackingPixels: { platform: string; id: string }[];
  adsExchanges: { exchange: string; publisherId: string; relationship: string }[];
  adActivity: string;
}

interface ApplicableCredit {
  id: string;
  name: string;
  section: string;
  maxValue: string;
  neglectLevel: "high" | "medium" | "low";
}

interface CreditAnalysisItem {
  creditId: string;
  creditName: string;
  section: string;
  status: "active" | "unclaimed" | "likely_unclaimed" | "partial" | "maxed_out" | "unknown";
  evidence: string;
  claimedAmount: number | null;
  potentialAmount: number | null;
  confidence: "xbrl_verified" | "inferred" | "estimated";
}

interface TaxPositionSummary {
  effectiveRate: number | null;
  statutoryRate: number;
  rateGap: number | null;
  taxesPaid: number | null;
  preTaxIncome: number | null;
  cashTaxRate: number | null;
  valuationAllowanceRatio: number | null;
  nolCarryforward: number | null;
  hasRdExpense: boolean;
  rdExpenseAmount: number | null;
  rdIntensity: number | null;
  creditDensity: number | null;
  employeeCount: number | null;
  capex: number | null;
  ppeNet: number | null;
  goodwill: number | null;
  stateRateImpact: number | null;
  foreignIncome: number | null;
}

interface LeadDelta {
  leadId: string;
  company: string;
  domain: string;
  sic: string;
  sicDescription: string;
  industryCategory: string;
  opportunityLevel: string;
  estimatedCreditLow: number;
  estimatedCreditHigh: number;
  pipelineStage: string;
  forms: DiscoveredForm[];
  hiddenFields: any[];
  formCount: number;
  fieldCount: number;
  applicableCredits: ApplicableCredit[];
  creditAnalysis: CreditAnalysisItem[];
  creditHealthScore: number;
  creditHealthLabel: string;
  taxPositionSummary: TaxPositionSummary | null;
  estimatedUnclaimedValue: number;
  xbrlDepth: number;
  ads: AdIntel;
  adNetworkCount: number;
  pixelCount: number;
  outreachHistory: any[];
}

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
  };
}

interface IndustryTree {
  categories: string[];
  industries: Record<string, { key: string; label: string; tier: number; codes: string[] }[]>;
  totalCount: number;
}

interface SecurityProfile {
  found: boolean;
  domain: string;
  wafType?: string;
  wafConfidence?: number;
  cdnProvider?: string;
  botDetectionScripts?: string[];
  challengeTypes?: string[];
  securityHeaders?: any;
  honeypotIndicators?: any[];
  counterIntelSignals?: any[];
  jsChallenge?: boolean;
  scanCount?: number;
  blockCount?: number;
  avgResponseTimeMs?: number;
}

const FORM_LABELS: Record<string, string> = {
  contact: "Contact", demo: "Demo", quote: "Quote", newsletter: "Newsletter",
  login: "Login", search: "Search", application: "Application", registration: "Registration",
  partnership: "Partnership", consultation: "Consultation", rfp: "RFP", investor: "Investor",
  webinar: "Webinar", support: "Support", other: "Other",
};

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<string>("all");
  const [minCredit, setMinCredit] = useState("");
  const [minRdScore, setMinRdScore] = useState("");
  const [composeForm, setComposeForm] = useState<{ lead: LeadDelta; form: DiscoveredForm } | null>(null);
  const [composeFields, setComposeFields] = useState<Record<string, string>>({});
  const [securityDomain, setSecurityDomain] = useState<string | null>(null);
  const [showCashews, setShowCashews] = useState(false);
  const [bloomIndustry, setBloomIndustry] = useState<string>("");
  const [bloomState, setBloomState] = useState<string>("");
  const [bloomCount, setBloomCount] = useState<string>("100");
  const [bloomRunning, setBloomRunning] = useState(false);
  const [bloomPhase, setBloomPhase] = useState("");
  const [bloomProgress, setBloomProgress] = useState<{ stored: number; total: number; scanned: number }>({ stored: 0, total: 0, scanned: 0 });
  const [bloomLog, setBloomLog] = useState<string[]>([]);

  const [senderProfile, setSenderProfile] = useState<{ name: string; email: string; phone: string; company: string; title: string }>(() => {
    try { const s = localStorage.getItem("light_sender"); return s ? JSON.parse(s) : { name: "", email: "", phone: "", company: "", title: "" }; }
    catch { return { name: "", email: "", phone: "", company: "", title: "" }; }
  });
  const [dryRun, setDryRun] = useState(true);
  const [submitRunning, setSubmitRunning] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ total: number; completed: number; succeeded: number; blocked: number; failed: number; skipped: number; current?: string } | null>(null);
  const [submitLog, setSubmitLog] = useState<Array<{ leadId: string; leadName: string; domain: string; formAction: string; success?: boolean; blocked?: boolean; skipped?: boolean; error?: string; dryRun?: boolean; skipReason?: string; graceful?: boolean }>>([]);
  const [showSubmitPanel, setShowSubmitPanel] = useState(false);
  const [submitAbort, setSubmitAbort] = useState<AbortController | null>(null);
  const [submittedLeads, setSubmittedLeads] = useState<Map<string, "success" | "blocked" | "failed" | "skipped" | "graceful">>(new Map());
  const [xrayRunning, setXrayRunning] = useState(false);
  const [xrayForceMode, setXrayForceMode] = useState(false);
  const [xrayProgress, setXrayProgress] = useState<{ scanned: number; updated: number; failed: number; total: number; skippedDead?: number }>({ scanned: 0, updated: 0, failed: 0, total: 0 });
  const [xrayLog, setXrayLog] = useState<string[]>([]);

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
        body: JSON.stringify({ industry: bloomIndustry, state: bloomState || undefined, count: parseInt(bloomCount) || 10 }),
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
                setBloomLog(prev => [...prev, `${data.company} — ${data.credits} credits`]);
                setBloomProgress(prev => ({ ...prev, stored: data.stored }));
              } else if (event === "progress") {
                setBloomProgress({ stored: data.stored, total: data.total, scanned: data.scanned });
              } else if (event === "skip") {
                setBloomLog(prev => [...prev, `Filtered: ${data.company} — ${data.reason}`]);
              } else if (event === "complete") {
                const qualityLine = data.skippedNoXbrl || data.skippedStale
                  ? ` · ${data.scanned} scanned · ${data.skippedNoXbrl || 0} no XBRL · ${data.skippedStale || 0} stale`
                  : "";
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
  }, [bloomIndustry, bloomState, bloomCount, bloomRunning, queryClient, toast]);

  useEffect(() => {
    localStorage.setItem("light_sender", JSON.stringify(senderProfile));
  }, [senderProfile]);

  const updateSender = useCallback((field: string, value: string) => {
    setSenderProfile(prev => ({ ...prev, [field]: value }));
  }, []);

  const startBatchSubmit = useCallback(async (leadIds?: string[]) => {
    if (submitRunning || !senderProfile.name || !senderProfile.email) return;
    setSubmitRunning(true);
    setSubmitLog([]);
    setSubmitProgress(null);
    setShowSubmitPanel(true);

    const abort = new AbortController();
    setSubmitAbort(abort);

    try {
      const res = await fetch("/api/light/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...(leadIds ? { leadIds } : { all: true }),
          senderProfile,
          dryRun,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "Unknown error");
        toast({ title: "Submission failed", description: errBody, variant: "destructive" });
        setSubmitRunning(false);
        setSubmitAbort(null);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        toast({ title: "No response stream", variant: "destructive" });
        setSubmitRunning(false);
        setSubmitAbort(null);
        return;
      }
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
            const dataMatch = part.match(/^data: (.+)$/m);
            if (!dataMatch) continue;
            try {
              const evt = JSON.parse(dataMatch[1]);
              if (evt.type === "queued") {
                setSubmitProgress({ total: evt.total, completed: 0, succeeded: 0, blocked: 0, failed: 0, skipped: 0 });
              } else if (evt.type === "submitting") {
                setSubmitProgress(p => p ? { ...p, current: evt.leadName || evt.domain } : p);
              } else if (evt.type === "result") {
                setSubmitLog(prev => [...prev, { leadId: evt.leadId, leadName: evt.leadName, domain: evt.domain, formAction: evt.formAction, success: evt.success, blocked: evt.blocked, skipped: evt.skipped, error: evt.error, dryRun: evt.dryRun, skipReason: evt.skipReason, graceful: evt.graceful }]);
                setSubmittedLeads(prev => {
                  const next = new Map(prev);
                  const status = evt.graceful ? "graceful" : evt.skipped ? "skipped" : evt.success ? "success" : evt.blocked ? "blocked" : "failed";
                  if (!next.has(evt.leadId) || status === "success") next.set(evt.leadId, status);
                  return next;
                });
              } else if (evt.type === "progress") {
                setSubmitProgress(evt);
              } else if (evt.type === "complete") {
                setSubmitProgress(prev => ({ ...prev, ...evt, current: undefined }));
                queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
                toast({ title: dryRun ? "Dry run complete" : "Batch submission complete", description: `${evt.succeeded} submitted, ${evt.blocked} blocked, ${evt.failed} failed` });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast({ title: "Submission failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setSubmitRunning(false);
      setSubmitAbort(null);
    }
  }, [submitRunning, senderProfile, dryRun, queryClient, toast]);

  const submitSingleLead = useCallback(async (leadId: string) => {
    if (!senderProfile.name || !senderProfile.email) {
      toast({ title: "Sender profile required", description: "Fill in your name and email in the Submit panel", variant: "destructive" });
      setShowSubmitPanel(true);
      return;
    }
    try {
      const res = await apiRequest("POST", "/api/light/submit-single", { leadId: Number(leadId), senderProfile, dryRun });
      const result = await res.json();
      setSubmittedLeads(prev => {
        const next = new Map(prev);
        next.set(leadId, result.graceful ? "graceful" : result.skipped ? "skipped" : result.success ? "success" : result.blocked ? "blocked" : "failed");
        return next;
      });
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/light/delta"] });
        toast({ title: dryRun ? "Dry run OK" : "Form submitted", description: result.formAction });
      } else if (result.graceful) {
        toast({ title: "Graceful skip", description: (result.skipReason || "defenses detected").replace(/_/g, " ") });
      } else {
        toast({ title: result.skipped ? "Skipped" : "Submission blocked", description: result.error || result.skipReason || result.wafDetected || "Could not submit", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Submit failed", description: err.message, variant: "destructive" });
    }
  }, [senderProfile, dryRun, queryClient, toast]);

  const deltaQuery = useQuery<DeltaMap>({ queryKey: ["/api/light/delta"] });
  const industryQuery = useQuery<IndustryTree>({ queryKey: ["/api/light/industries"] });

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
    list.sort((a, b) => {
      if (sortBy === "forms") return b.formCount - a.formCount;
      if (sortBy === "ads") return b.adNetworkCount - a.adNetworkCount;
      if (sortBy === "credits") return b.applicableCredits.length - a.applicableCredits.length;
      if (sortBy === "creditHealth") return (a.creditHealthScore || 0) - (b.creditHealthScore || 0);
      if (sortBy === "unclaimed") return (b.estimatedUnclaimedValue || 0) - (a.estimatedUnclaimedValue || 0);
      return a.company.localeCompare(b.company);
    });
    return list;
  }, [deltaQuery.data, sortBy, searchTerm, selectedCategory, selectedSubIndustry, minCredit, minRdScore, hideDead]);

  const openCompose = useCallback((lead: LeadDelta, form: DiscoveredForm) => {
    setComposeForm({ lead, form });
    const prefill: Record<string, string> = {};
    for (const f of form.fields) {
      const name = (f.name || "").toLowerCase();
      const type = (f.type || "").toLowerCase();
      const isTextarea = f.tag?.toUpperCase() === "TEXTAREA" || type === "textarea";
      if (isTextarea || name.includes("message") || name.includes("comment") || name.includes("description")) {
        let messageBody = "";
        const hasCreditAnalysis = lead.creditAnalysis?.length > 0 && lead.xbrlDepth > 0;

        if (hasCreditAnalysis) {
          const unclaimed = lead.creditAnalysis.filter(ca => ca.status === "unclaimed" || ca.status === "likely_unclaimed");
          const active = lead.creditAnalysis.filter(ca => ca.status === "active");
          const parts: string[] = [];
          parts.push(`Based on ${lead.company}'s SEC filings (${lead.xbrlDepth} financial data points analyzed), I've identified specific tax credit opportunities.`);
          if (unclaimed.length > 0) {
            const topUnclaimed = unclaimed.slice(0, 3).map(u => u.creditName).join(", ");
            parts.push(`Notably, ${unclaimed.length} credit${unclaimed.length > 1 ? "s appear" : " appears"} untouched: ${topUnclaimed}.`);
          }
          if (lead.estimatedUnclaimedValue > 0) {
            parts.push(`Estimated unclaimed value: ${formatCurrency(lead.estimatedUnclaimedValue)}.`);
          }
          if (active.length > 0) {
            parts.push(`I can see ${lead.company} is already utilizing ${active.length} credit${active.length > 1 ? "s" : ""}, which shows strong tax planning — there may be additional optimization available.`);
          }
          if (lead.taxPositionSummary?.rdIntensity && lead.taxPositionSummary.rdIntensity > 0.03) {
            parts.push(`With R&D intensity at ${(lead.taxPositionSummary.rdIntensity * 100).toFixed(1)}% of revenue, there's significant credit-eligible activity.`);
          }
          parts.push("I'd welcome the opportunity to discuss how we can help maximize your eligible credits.");
          messageBody = parts.join(" ");
        } else {
          const credits = lead.applicableCredits.length > 0
            ? ` I've identified ${lead.applicableCredits.length} potential tax credit opportunities including ${lead.applicableCredits.slice(0, 3).map(c => c.name).join(", ")}.`
            : "";
          const credit = lead.estimatedCreditLow > 0 || lead.estimatedCreditHigh > 0
            ? ` (estimated credit value: ${formatCurrency(lead.estimatedCreditLow)}–${formatCurrency(lead.estimatedCreditHigh)})`
            : "";
          messageBody = `I identified ${lead.company} as a strong candidate for significant tax credit opportunities${credit}.${credits} I'd welcome the opportunity to discuss how we can help maximize your eligible credits.`;
        }
        prefill[f.name || ""] = messageBody;
      } else if (name.includes("subject") || name.includes("topic")) {
        prefill[f.name || ""] = `Tax Credit Opportunities — ${lead.company}`;
      } else if (name.includes("email") || type === "email") {
        prefill[f.name || ""] = senderProfile.email || "";
      } else if (name.includes("firstname") || name.includes("first_name") || name.includes("first-name") || name.includes("fname")) {
        prefill[f.name || ""] = (senderProfile.name || "").split(" ")[0] || "";
      } else if (name.includes("lastname") || name.includes("last_name") || name.includes("last-name") || name.includes("lname") || name.includes("surname")) {
        prefill[f.name || ""] = (senderProfile.name || "").split(" ").slice(1).join(" ") || "";
      } else if (name.includes("name") || name.includes("fullname") || name.includes("full_name")) {
        prefill[f.name || ""] = senderProfile.name || "";
      } else if (name.includes("phone") || name.includes("tel") || type === "tel") {
        prefill[f.name || ""] = senderProfile.phone || "";
      } else if (name.includes("company") || name.includes("organization") || name.includes("organisation") || name.includes("business")) {
        prefill[f.name || ""] = senderProfile.company || "";
      } else if (name.includes("title") || name.includes("jobtitle") || name.includes("position") || name.includes("role")) {
        prefill[f.name || ""] = senderProfile.title || "";
      } else {
        prefill[f.name || ""] = "";
      }
    }
    setComposeFields(prefill);
  }, [senderProfile]);

  const saveCompose = useCallback(() => {
    if (!composeForm) return;
    const summary = Object.entries(composeFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
    saveMutation.mutate({
      leadId: composeForm.lead.leadId,
      channel: "form",
      status: "composed",
      message: `Form: ${composeForm.form.action} (${composeForm.form.method})\n${composeForm.form.classification}\n\n${summary}`,
      target: composeForm.form.action,
    });
    setComposeForm(null);
    setComposeFields({});
  }, [composeForm, composeFields, saveMutation]);

  const agg = deltaQuery.data?.aggregate;
  const tree = industryQuery.data;

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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/8 border border-amber-400/15 flex items-center justify-center">
              <Sun className="w-5 h-5 text-amber-300/70" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-amber-100/90" data-testid="text-light-engine-title">Light Engine</h1>
              <p className="text-xs text-amber-400/30">{hasLeads ? "Forms, flowers, and credits across all leads" : "Tax credit intelligence — start by discovering leads"}</p>
            </div>
          </div>
          {hasLeads && (
            <Button variant="ghost" size="sm" onClick={() => deltaQuery.refetch()} data-testid="button-refresh-delta"
              className="text-amber-400/40" disabled={deltaQuery.isFetching}>
              {deltaQuery.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sun className="w-3.5 h-3.5" />}
            </Button>
          )}
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
      </div>

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

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <Select value={bloomIndustry} onValueChange={setBloomIndustry} data-testid="select-bloom-industry">
                  <SelectTrigger className="h-10 text-sm bg-transparent text-amber-200/60 border-amber-500/15">
                    <SelectValue placeholder="Pick an industry to bloom..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tree?.categories.map(cat => {
                      const subs = tree.industries[cat] || [];
                      return subs.map(ind => (
                        <SelectItem key={ind.key} value={ind.key}>
                          <span className="text-amber-300/50 text-[10px] mr-1.5">{cat}</span> {ind.label}
                        </SelectItem>
                      ));
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
              <Button onClick={startBloom} disabled={!bloomIndustry || bloomRunning} data-testid="button-bloom"
                className="h-10 px-6 text-xs font-medium border border-amber-400/15 bg-amber-500/20 text-amber-100/80">
                {bloomRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Flower2 className="w-3.5 h-3.5 mr-1.5" />}
                {bloomRunning ? "Blooming..." : "Bloom"}
              </Button>
            </div>
          </>
        )}

        {hasLeads && (
          <div className="flex items-center gap-2 flex-wrap">
            <Flower2 className="w-3.5 h-3.5 text-amber-300/40 shrink-0" />
            <span className="text-xs text-amber-200/40 shrink-0">Bloom more:</span>
            <div className="w-44">
              <Select value={bloomIndustry} onValueChange={setBloomIndustry} data-testid="select-bloom-industry">
                <SelectTrigger className="h-7 text-xs bg-transparent text-amber-200/50 border-amber-500/10 border-dashed">
                  <SelectValue placeholder="Industry..." />
                </SelectTrigger>
                <SelectContent>
                  {tree?.categories.map(cat => {
                    const subs = tree.industries[cat] || [];
                    return subs.map(ind => (
                      <SelectItem key={ind.key} value={ind.key}>
                        <span className="text-amber-300/50 text-[10px] mr-1.5">{cat}</span> {ind.label}
                      </SelectItem>
                    ));
                  })}
                </SelectContent>
              </Select>
            </div>
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
        <div className={`rounded-xl border space-y-4 transition-all ${showSubmitPanel ? "border-sky-400/15 bg-gradient-to-br from-sky-950/8 to-sky-900/5 p-5" : "border-sky-500/8 bg-sky-950/3 p-3"}`} data-testid="section-submit-engine">
          <button onClick={() => setShowSubmitPanel(!showSubmitPanel)} className="flex items-center gap-3 w-full text-left" data-testid="button-toggle-submit">
            <div className={`rounded-lg bg-sky-400/8 border border-sky-400/15 flex items-center justify-center ${showSubmitPanel ? "w-9 h-9" : "w-8 h-8"}`}>
              <Rocket className={`text-sky-300/60 ${showSubmitPanel ? "w-4.5 h-4.5" : "w-4 h-4"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`font-medium text-sky-200/70 ${showSubmitPanel ? "text-sm" : "text-xs"}`}>
                Form Submitter
              </h2>
              {!showSubmitPanel && <p className="text-[11px] text-sky-400/25">Fill and submit lead forms at scale</p>}
            </div>
            {submittedLeads.size > 0 && !showSubmitPanel && (
              <div className="flex items-center gap-1.5 text-[11px]">
                {Array.from(submittedLeads.values()).filter(v => v === "success").length > 0 && <span className="text-emerald-400/50">{Array.from(submittedLeads.values()).filter(v => v === "success").length} sent</span>}
                {Array.from(submittedLeads.values()).filter(v => v === "graceful").length > 0 && <span className="text-lime-400/40">{Array.from(submittedLeads.values()).filter(v => v === "graceful").length} graceful</span>}
                {Array.from(submittedLeads.values()).filter(v => v === "blocked").length > 0 && <span className="text-orange-400/50">{Array.from(submittedLeads.values()).filter(v => v === "blocked").length} blocked</span>}
              </div>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-sky-400/25 transition-transform ${showSubmitPanel ? "rotate-180" : ""}`} />
          </button>

          {showSubmitPanel && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-sky-400/30 flex items-center gap-1"><User className="w-2.5 h-2.5" /> Your Name *</label>
                  <Input value={senderProfile.name} onChange={e => updateSender("name", e.target.value)} data-testid="input-sender-name"
                    className="h-8 text-xs bg-transparent border-sky-500/10 focus:border-sky-500/20 placeholder:text-sky-400/15"
                    placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-sky-400/30 flex items-center gap-1"><Mail className="w-2.5 h-2.5" /> Your Email *</label>
                  <Input value={senderProfile.email} onChange={e => updateSender("email", e.target.value)} data-testid="input-sender-email"
                    className="h-8 text-xs bg-transparent border-sky-500/10 focus:border-sky-500/20 placeholder:text-sky-400/15"
                    placeholder="jane@company.com" type="email" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-sky-400/30 flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> Phone</label>
                  <Input value={senderProfile.phone} onChange={e => updateSender("phone", e.target.value)} data-testid="input-sender-phone"
                    className="h-8 text-xs bg-transparent border-sky-500/10 focus:border-sky-500/20 placeholder:text-sky-400/15"
                    placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-sky-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Company</label>
                  <Input value={senderProfile.company} onChange={e => updateSender("company", e.target.value)} data-testid="input-sender-company"
                    className="h-8 text-xs bg-transparent border-sky-500/10 focus:border-sky-500/20 placeholder:text-sky-400/15"
                    placeholder="Acme Tax Consulting" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-sky-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Title</label>
                <Input value={senderProfile.title} onChange={e => updateSender("title", e.target.value)} data-testid="input-sender-title"
                  className="h-8 text-xs bg-transparent border-sky-500/10 focus:border-sky-500/20 placeholder:text-sky-400/15"
                  placeholder="Tax Credit Specialist" />
              </div>

              <Separator className="bg-sky-500/8" />

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={dryRun} onCheckedChange={setDryRun} data-testid="switch-dry-run" />
                    <span className={`text-xs ${dryRun ? "text-sky-300/60" : "text-amber-300/60"}`}>{dryRun ? "Dry Run" : "Live Submit"}</span>
                  </div>
                  {!dryRun && (
                    <span className="text-[10px] text-amber-400/40 flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> Forms will actually be submitted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-sky-400/25">
                  <span>{agg?.withForms || 0} leads with forms</span>
                  <span>·</span>
                  <span>{agg?.totalForms || 0} forms total</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => startBatchSubmit()} disabled={submitRunning || !senderProfile.name || !senderProfile.email} data-testid="button-submit-all"
                  className={`flex-1 text-xs h-9 border ${dryRun ? "bg-sky-500/12 text-sky-200/70 border-sky-400/15" : "bg-amber-500/15 text-amber-200/70 border-amber-400/15"}`}>
                  {submitRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Rocket className="w-3.5 h-3.5 mr-1.5" />}
                  {submitRunning ? "Submitting..." : dryRun ? "Dry Run — All Leads" : "Submit All Forms"}
                </Button>
                {submitRunning && submitAbort && (
                  <Button variant="outline" size="sm" onClick={() => submitAbort.abort()} data-testid="button-abort-submit"
                    className="h-9 px-3 text-xs border-red-500/15 text-red-300/50">
                    <PauseCircle className="w-3.5 h-3.5 mr-1" /> Stop
                  </Button>
                )}
              </div>

              {submitProgress && (
                <div className="space-y-2">
                  <div className="w-full h-2 rounded-full bg-sky-500/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${submitProgress.total > 0 ? (submitProgress.completed / submitProgress.total) * 100 : 0}%`,
                        background: `linear-gradient(90deg, rgba(56,189,248,0.3) 0%, rgba(52,211,153,0.3) 100%)`,
                      }} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] flex-wrap">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-400/50">{submitProgress.succeeded} sent</span>
                      <span className="text-orange-400/50">{submitProgress.blocked} blocked</span>
                      <span className="text-red-400/50">{submitProgress.failed} failed</span>
                      <span className="text-zinc-400/30">{submitProgress.skipped} skipped</span>
                    </div>
                    <span className="text-sky-400/30 tabular-nums">{submitProgress.completed}/{submitProgress.total}</span>
                  </div>
                  {submitProgress.current && (
                    <div className="flex items-center gap-2 text-[11px] text-sky-300/30">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span className="truncate">{submitProgress.current}</span>
                    </div>
                  )}
                </div>
              )}

              {submitLog.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-sky-500/5 bg-sky-950/3 p-2">
                  {submitLog.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                      {entry.success ? <CheckCircle className="w-2.5 h-2.5 text-emerald-400/50 shrink-0" /> :
                        entry.graceful ? <Leaf className="w-2.5 h-2.5 text-lime-400/45 shrink-0" /> :
                        entry.blocked ? <ShieldAlert className="w-2.5 h-2.5 text-orange-400/50 shrink-0" /> :
                        entry.skipped ? <MinusCircle className="w-2.5 h-2.5 text-zinc-400/30 shrink-0" /> :
                        <XCircle className="w-2.5 h-2.5 text-red-400/50 shrink-0" />}
                      <span className={`truncate ${entry.graceful ? "text-lime-300/35" : "text-sky-300/40"}`}>{entry.leadName}</span>
                      {entry.skipReason && (
                        <span className={`text-[10px] truncate ${entry.graceful ? "text-lime-400/25" : "text-zinc-400/25"}`}>{entry.skipReason.replace(/_/g, " ")}</span>
                      )}
                      {!entry.skipReason && <span className="text-sky-400/15 font-mono truncate flex-1">{entry.formAction}</span>}
                      {entry.dryRun && <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-500/10 text-sky-400/30">dry</Badge>}
                      {entry.error && <span className="text-red-400/30 truncate text-[10px]">{entry.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

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

      <div className="space-y-3">
        {leads.map(lead => {
          const expanded = expandedId === lead.leadId;
          const phase = getLightPhase(lead.outreachHistory);
          const hasForms = lead.formCount > 0;
          const hasAds = lead.ads?.adActivity === "active";
          const hasCredits = lead.applicableCredits.length > 0;
          const hasCreditXray = (lead.xbrlDepth || 0) > 0 && (lead.creditAnalysis?.length || 0) > 0;
          const healthScore = Math.max(0, Math.min(100, lead.creditHealthScore || 0));
          const highNeglectCredits = lead.applicableCredits.filter(c => c.neglectLevel === "high");

          return (
            <Card key={lead.leadId} data-testid={`card-light-lead-${lead.leadId}`}
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

                    {submittedLeads.has(lead.leadId) && (
                      <span data-testid={`status-submit-${lead.leadId}`}>
                        {submittedLeads.get(lead.leadId) === "success" && <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60" title="Submitted" />}
                        {submittedLeads.get(lead.leadId) === "graceful" && <Leaf className="w-3.5 h-3.5 text-lime-400/50" title="Graceful skip" />}
                        {submittedLeads.get(lead.leadId) === "blocked" && <ShieldAlert className="w-3.5 h-3.5 text-orange-400/50" title="Blocked by WAF" />}
                        {submittedLeads.get(lead.leadId) === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400/50" title="Failed" />}
                        {submittedLeads.get(lead.leadId) === "skipped" && <MinusCircle className="w-3.5 h-3.5 text-zinc-400/25" title="Skipped" />}
                      </span>
                    )}

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
                          {hasCreditXray ? lead.creditAnalysis.map((ca, ci) => {
                            const statusColors: Record<string, string> = {
                              active: "text-emerald-300/80 border-emerald-500/20 bg-emerald-500/8",
                              unclaimed: "text-amber-200 border-amber-400/25 bg-amber-500/10 animate-pulse",
                              likely_unclaimed: "text-amber-300/70 border-amber-500/20 bg-amber-500/8",
                              partial: "text-yellow-300/70 border-yellow-500/20 bg-yellow-500/8",
                              maxed_out: "text-emerald-400/60 border-emerald-500/15",
                              unknown: "text-zinc-400/50 border-zinc-500/15",
                            };
                            const statusLabels: Record<string, string> = {
                              active: "Active", unclaimed: "Unclaimed", likely_unclaimed: "Likely Unclaimed",
                              partial: "Partial", maxed_out: "Maxed Out", unknown: "Unknown",
                            };
                            return (
                              <div key={ci} className="flex items-start gap-3 py-2 px-3 rounded border border-amber-500/5 bg-amber-950/3" data-testid={`credit-analysis-${lead.leadId}-${ca.creditId}`}>
                                <Sparkles className={`w-3 h-3 shrink-0 mt-0.5 ${ca.status === "unclaimed" || ca.status === "likely_unclaimed" ? "text-amber-300/60" : ca.status === "active" ? "text-emerald-400/60" : "text-amber-500/25"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-amber-200/60 font-medium">{ca.creditName}</span>
                                    <span className="text-[10px] text-amber-400/30 font-mono">{ca.section}</span>
                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusColors[ca.status] || statusColors.unknown}`}>
                                      {statusLabels[ca.status] || ca.status}
                                    </Badge>
                                    {ca.confidence === "xbrl_verified" && (
                                      <span className="text-[9px] text-emerald-400/40 flex items-center gap-0.5"><CheckCircle className="w-2 h-2" />XBRL</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-amber-400/30 mt-0.5 leading-relaxed">{ca.evidence}</p>
                                  <div className="flex items-center gap-3 mt-1">
                                    {ca.claimedAmount !== null && ca.claimedAmount > 0 && (
                                      <span className="text-[10px] text-emerald-300/50 font-medium tabular-nums">{formatCurrency(ca.claimedAmount)} claimed</span>
                                    )}
                                    {ca.potentialAmount !== null && ca.potentialAmount > 0 && (
                                      <span className="text-[10px] text-amber-300/60 font-medium tabular-nums">{formatCurrency(ca.potentialAmount)} potential</span>
                                    )}
                                  </div>
                                </div>
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
                            <span className="text-xs text-amber-300/40 font-mono truncate">{form.action}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => { navigator.clipboard.writeText(form.action); toast({ title: "URL copied" }); }}
                              className="text-amber-400/20 hover:text-amber-400/40 transition-colors" data-testid={`button-copy-form-${i}`}>
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <Button variant="outline" size="sm" data-testid={`button-fill-form-${i}`}
                              onClick={() => openCompose(lead, form)}
                              className="h-7 px-3 text-xs border-amber-500/15 text-amber-200/60 bg-transparent">
                              <Pencil className="w-3 h-3 mr-1.5" /> Fill
                            </Button>
                            <Button variant="outline" size="sm" data-testid={`button-submit-form-${lead.leadId}-${i}`}
                              onClick={() => submitSingleLead(lead.leadId)}
                              className="h-7 px-3 text-xs border-sky-500/15 text-sky-200/60 bg-transparent">
                              <Rocket className="w-3 h-3 mr-1.5" /> {dryRun ? "Test" : "Send"}
                            </Button>
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

      <Dialog open={!!composeForm} onOpenChange={open => { if (!open) setComposeForm(null); }}>
        <DialogContent className="max-w-md border-amber-500/10 bg-card">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium text-amber-100/80 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-amber-400/40" />
              Fill form — {composeForm?.lead.company}
            </DialogTitle>
          </DialogHeader>
          {composeForm && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-amber-400/30 flex-wrap">
                <Badge variant="outline" className="text-[10px] border-amber-500/10 text-amber-300/50">
                  {FORM_LABELS[composeForm.form.classification] || "Other"}
                </Badge>
                <span className="font-mono truncate">{composeForm.form.action}</span>
              </div>
              <Separator className="bg-amber-500/5" />
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {composeForm.form.fields.map((f, fi) => {
                  const fieldName = f.name || `field_${fi}`;
                  const isTextarea = f.tag?.toUpperCase() === "TEXTAREA" || (f.type || "").toLowerCase() === "textarea";
                  return (
                    <div key={fi} className="space-y-1.5">
                      <label className="text-xs text-amber-400/40 flex items-center gap-2">
                        <span className="font-mono">{f.name || "(unnamed)"}</span>
                        {f.required && <span className="text-red-400/40">required</span>}
                      </label>
                      {isTextarea ? (
                        <Textarea value={composeFields[fieldName] || ""} rows={4} data-testid={`input-compose-field-${fi}`}
                          onChange={e => setComposeFields(p => ({ ...p, [fieldName]: e.target.value }))}
                          className="text-sm bg-transparent border-amber-500/10 resize-none focus:border-amber-500/20"
                          placeholder={f.placeholder || ""} />
                      ) : (
                        <Input value={composeFields[fieldName] || ""} data-testid={`input-compose-field-${fi}`}
                          type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                          onChange={e => setComposeFields(p => ({ ...p, [fieldName]: e.target.value }))}
                          className="text-sm bg-transparent border-amber-500/10 focus:border-amber-500/20"
                          placeholder={f.placeholder || ""} />
                      )}
                    </div>
                  );
                })}
              </div>
              {composeForm.form.hiddenFields.length > 0 && (
                <div className="pt-2 border-t border-amber-500/5">
                  <span className="text-[11px] text-amber-400/15 flex items-center gap-1 mb-1"><Lock className="w-2.5 h-2.5" /> Hidden fields</span>
                  {composeForm.form.hiddenFields.map((h, hi) => (
                    <div key={hi} className="text-[11px] text-zinc-500/30 font-mono py-0.5">{h.name}: {h.value}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setComposeForm(null)} className="text-amber-400/30">Cancel</Button>
            <Button size="sm" onClick={saveCompose} data-testid="button-save-compose"
              className="bg-amber-500/15 text-amber-200/80 border border-amber-500/15">
              <Send className="w-3 h-3 mr-1.5" /> Save composition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
