import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, ChevronRight, ChevronDown, Trash2, Loader2, Search,
  Coins, Sparkles, Activity,
  MapPin, TrendingUp, DollarSign, Factory,
  FolderOpen, Heart, Globe2,
  Rocket, User, Mail, Briefcase, Phone,
  CheckCircle, ShieldAlert, XCircle, MinusCircle, Leaf, PauseCircle, Zap,
  Bug,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface BatchInfo {
  tag: string;
  count: number;
  allocatedAt: string;
}

interface PortfolioData {
  allocations: Array<{
    id: string;
    leadId: string;
    company: string;
    domain: string | null;
    batchTag: string | null;
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
  batches: BatchInfo[];
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
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  const [showBumblebee, setShowBumblebee] = useState(false);
  const [senderProfile, setSenderProfile] = useState<{ name: string; email: string; phone: string; company: string; title: string }>(() => {
    try { const s = localStorage.getItem("light_sender"); return s ? JSON.parse(s) : { name: "", email: "", phone: "", company: "", title: "" }; }
    catch { return { name: "", email: "", phone: "", company: "", title: "" }; }
  });
  const [dryRun, setDryRun] = useState(true);
  const [submitRunning, setSubmitRunning] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<{ total: number; completed: number; succeeded: number; blocked: number; failed: number; skipped: number; current?: string } | null>(null);
  const [submitLog, setSubmitLog] = useState<Array<{ leadId: string; leadName: string; domain: string; formAction: string; success?: boolean; blocked?: boolean; skipped?: boolean; error?: string; dryRun?: boolean; skipReason?: string; graceful?: boolean }>>([]);
  const [submitAbort, setSubmitAbort] = useState<AbortController | null>(null);
  const [submittedLeads, setSubmittedLeads] = useState<Map<string, "success" | "blocked" | "failed" | "skipped" | "graceful">>(new Map());

  const portfolioQuery = useQuery<PortfolioData>({ queryKey: ["/api/portfolio"] });

  useEffect(() => {
    localStorage.setItem("light_sender", JSON.stringify(senderProfile));
  }, [senderProfile]);

  const updateSender = useCallback((field: string, value: string) => {
    setSenderProfile(prev => ({ ...prev, [field]: value }));
  }, []);

  const filteredAllocations = useMemo(() => {
    if (!portfolioQuery.data?.allocations) return [];
    let result = portfolioQuery.data.allocations;
    if (selectedBatches.size > 0) {
      result = result.filter(a => selectedBatches.has(a.batchTag || "Untagged"));
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.company.toLowerCase().includes(t) || a.domain?.toLowerCase().includes(t)
      );
    }
    return result;
  }, [portfolioQuery.data, searchTerm, selectedBatches]);

  const selectedLeadIds = useMemo(() => {
    if (selectedLeads.size > 0) return Array.from(selectedLeads);
    return filteredAllocations.map(a => a.leadId);
  }, [selectedLeads, filteredAllocations]);

  const formsInSelection = useMemo(() => {
    let total = 0;
    let withForms = 0;
    for (const alloc of filteredAllocations) {
      if (selectedLeads.size > 0 && !selectedLeads.has(alloc.leadId)) continue;
      const forms = alloc.lead?.enrichmentData?.discoveredForms || [];
      if (forms.length > 0) { withForms++; total += forms.length; }
    }
    return { total, withForms };
  }, [filteredAllocations, selectedLeads]);

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

  const toggleBatch = (tag: string) => {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
    setSelectedLeads(new Set());
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedLeads(new Set(filteredAllocations.map(a => a.leadId)));
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

  const startBatchSubmit = useCallback(async () => {
    if (submitRunning || !senderProfile.name || !senderProfile.email) return;
    if (selectedLeadIds.length === 0) {
      toast({ title: "No leads selected", description: "Select batches or individual leads to submit forms to", variant: "destructive" });
      return;
    }
    setSubmitRunning(true);
    setSubmitLog([]);
    setSubmitProgress(null);
    setShowBumblebee(true);

    const abort = new AbortController();
    setSubmitAbort(abort);

    try {
      const res = await fetch("/api/light/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          leadIds: selectedLeadIds,
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
              queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] });
              toast({ title: dryRun ? "Dry run complete" : "Batch submission complete", description: `${evt.succeeded} submitted, ${evt.blocked} blocked, ${evt.failed} failed` });
            }
          } catch {}
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
  }, [submitRunning, senderProfile, dryRun, selectedLeadIds, queryClient, toast]);

  const intel = portfolioQuery.data?.intelligence;
  const batches = portfolioQuery.data?.batches || [];

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

          {batches.length > 0 && (
            <div className="space-y-2" data-testid="section-batch-selector">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground/30 font-medium">Allocation Batches</span>
                <div className="flex items-center gap-2">
                  {selectedBatches.size > 0 && (
                    <button onClick={() => { setSelectedBatches(new Set()); setSelectedLeads(new Set()); }}
                      className="text-[10px] text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-clear-batches">
                      Clear
                    </button>
                  )}
                  <button onClick={() => { setSelectedBatches(new Set(batches.map(b => b.tag))); setSelectedLeads(new Set()); }}
                    className="text-[10px] text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-select-all-batches">
                    All
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2" data-testid="batch-chips">
                {batches.map(b => {
                  const isSelected = selectedBatches.has(b.tag);
                  return (
                    <button key={b.tag} onClick={() => toggleBatch(b.tag)} data-testid={`batch-chip-${b.tag}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200/80 shadow-sm shadow-emerald-500/5"
                          : "bg-card/40 border-emerald-500/8 text-muted-foreground/40 hover:border-emerald-400/20 hover:text-muted-foreground/60"
                      }`}>
                      <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold tabular-nums ${
                        isSelected ? "bg-emerald-400/20 text-emerald-200" : "bg-muted/10 text-muted-foreground/30"
                      }`}>
                        {b.count}
                      </span>
                      <span className="truncate max-w-[140px]">{b.tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`rounded-xl border space-y-4 transition-all ${showBumblebee ? "border-amber-400/15 bg-gradient-to-br from-amber-950/8 to-amber-900/5 p-5" : "border-amber-500/8 bg-amber-950/3 p-3"}`} data-testid="section-bumblebee">
            <button onClick={() => setShowBumblebee(!showBumblebee)} className="flex items-center gap-3 w-full text-left" data-testid="button-toggle-bumblebee">
              <div className={`rounded-lg bg-amber-400/8 border border-amber-400/15 flex items-center justify-center ${showBumblebee ? "w-9 h-9" : "w-8 h-8"}`}>
                <Bug className={`text-amber-300/60 ${showBumblebee ? "w-4.5 h-4.5" : "w-4 h-4"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`font-medium text-amber-200/70 ${showBumblebee ? "text-sm" : "text-xs"}`}>
                  Bumblebee
                </h2>
                {!showBumblebee && <p className="text-[11px] text-amber-400/25">Submit forms to portfolio companies</p>}
              </div>
              {submittedLeads.size > 0 && !showBumblebee && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  {Array.from(submittedLeads.values()).filter(v => v === "success").length > 0 && <span className="text-emerald-400/50">{Array.from(submittedLeads.values()).filter(v => v === "success").length} sent</span>}
                  {Array.from(submittedLeads.values()).filter(v => v === "graceful").length > 0 && <span className="text-lime-400/40">{Array.from(submittedLeads.values()).filter(v => v === "graceful").length} graceful</span>}
                  {Array.from(submittedLeads.values()).filter(v => v === "blocked").length > 0 && <span className="text-orange-400/50">{Array.from(submittedLeads.values()).filter(v => v === "blocked").length} blocked</span>}
                </div>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-amber-400/25 transition-transform ${showBumblebee ? "rotate-180" : ""}`} />
            </button>

            {showBumblebee && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><User className="w-2.5 h-2.5" /> Your Name *</label>
                    <Input value={senderProfile.name} onChange={e => updateSender("name", e.target.value)} data-testid="input-sender-name"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="Jane Smith" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Mail className="w-2.5 h-2.5" /> Your Email *</label>
                    <Input value={senderProfile.email} onChange={e => updateSender("email", e.target.value)} data-testid="input-sender-email"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="jane@company.com" type="email" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> Phone</label>
                    <Input value={senderProfile.phone} onChange={e => updateSender("phone", e.target.value)} data-testid="input-sender-phone"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="(555) 123-4567" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Company</label>
                    <Input value={senderProfile.company} onChange={e => updateSender("company", e.target.value)} data-testid="input-sender-company"
                      className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                      placeholder="Acme Tax Consulting" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-amber-400/30 flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> Title</label>
                  <Input value={senderProfile.title} onChange={e => updateSender("title", e.target.value)} data-testid="input-sender-title"
                    className="h-8 text-xs bg-transparent border-amber-500/10 focus:border-amber-500/20 placeholder:text-amber-400/15"
                    placeholder="Tax Credit Specialist" />
                </div>

                <Separator className="bg-amber-500/8" />

                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={dryRun} onCheckedChange={setDryRun} data-testid="switch-dry-run" />
                      <span className={`text-xs ${dryRun ? "text-amber-300/60" : "text-red-300/60"}`}>{dryRun ? "Dry Run" : "Live Submit"}</span>
                    </div>
                    {!dryRun && (
                      <span className="text-[10px] text-red-400/40 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> Forms will actually be submitted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-amber-400/25">
                    <span>{formsInSelection.withForms} leads with forms</span>
                    <span>·</span>
                    <span>{formsInSelection.total} forms total</span>
                    {selectedBatches.size > 0 && <span>· {selectedBatches.size} batch{selectedBatches.size > 1 ? "es" : ""}</span>}
                    {selectedLeads.size > 0 && <span>· {selectedLeads.size} selected</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button onClick={startBatchSubmit} disabled={submitRunning || !senderProfile.name || !senderProfile.email || selectedLeadIds.length === 0} data-testid="button-submit-batch"
                    className={`flex-1 text-xs h-9 border ${dryRun ? "bg-amber-500/12 text-amber-200/70 border-amber-400/15" : "bg-red-500/15 text-red-200/70 border-red-400/15"}`}>
                    {submitRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Rocket className="w-3.5 h-3.5 mr-1.5" />}
                    {submitRunning ? "Bees are flying..." : dryRun
                      ? `Dry Run — ${selectedLeads.size > 0 ? selectedLeads.size : filteredAllocations.length} Leads`
                      : `Send Bees — ${selectedLeads.size > 0 ? selectedLeads.size : filteredAllocations.length} Leads`}
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
                    <div className="w-full h-2 rounded-full bg-amber-500/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${submitProgress.total > 0 ? (submitProgress.completed / submitProgress.total) * 100 : 0}%`,
                          background: `linear-gradient(90deg, rgba(251,191,36,0.3) 0%, rgba(52,211,153,0.3) 100%)`,
                        }} />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400/50">{submitProgress.succeeded} sent</span>
                        <span className="text-orange-400/50">{submitProgress.blocked} blocked</span>
                        <span className="text-red-400/50">{submitProgress.failed} failed</span>
                        <span className="text-zinc-400/30">{submitProgress.skipped} skipped</span>
                      </div>
                      <span className="text-amber-400/30 tabular-nums">{submitProgress.completed}/{submitProgress.total}</span>
                    </div>
                    {submitProgress.current && (
                      <div className="flex items-center gap-2 text-[11px] text-amber-300/30">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span className="truncate">{submitProgress.current}</span>
                      </div>
                    )}
                  </div>
                )}

                {submitLog.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border border-amber-500/5 bg-amber-950/3 p-2">
                    {submitLog.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                        {entry.success ? <CheckCircle className="w-2.5 h-2.5 text-emerald-400/50 shrink-0" /> :
                          entry.graceful ? <Leaf className="w-2.5 h-2.5 text-lime-400/45 shrink-0" /> :
                          entry.blocked ? <ShieldAlert className="w-2.5 h-2.5 text-orange-400/50 shrink-0" /> :
                          entry.skipped ? <MinusCircle className="w-2.5 h-2.5 text-zinc-400/30 shrink-0" /> :
                          <XCircle className="w-2.5 h-2.5 text-red-400/50 shrink-0" />}
                        <span className={`truncate ${entry.graceful ? "text-lime-300/35" : "text-amber-300/40"}`}>{entry.leadName}</span>
                        {entry.skipReason && (
                          <span className={`text-[10px] truncate ${entry.graceful ? "text-lime-400/25" : "text-zinc-400/25"}`}>{entry.skipReason.replace(/_/g, " ")}</span>
                        )}
                        {!entry.skipReason && <span className="text-amber-400/15 font-mono truncate flex-1">{entry.formAction}</span>}
                        {entry.dryRun && <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/10 text-amber-400/30">dry</Badge>}
                        {entry.error && <span className="text-red-400/30 truncate text-[10px]">{entry.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/25" />
              <Input placeholder="Search portfolio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm bg-transparent border-emerald-500/10 focus:border-emerald-500/25 placeholder:text-muted-foreground/20"
                data-testid="input-search-portfolio" />
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              {selectedLeads.size > 0 ? (
                <button onClick={() => setSelectedLeads(new Set())} className="text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-clear-selection">
                  Clear {selectedLeads.size} selected
                </button>
              ) : (
                <button onClick={selectAllVisible} className="text-emerald-400/40 hover:text-emerald-400/60 transition-colors" data-testid="button-select-all-leads">
                  Select all {filteredAllocations.length}
                </button>
              )}
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

          {searchTerm || selectedBatches.size > 0 ? (
            <div className="space-y-2">
              {filteredAllocations.map(alloc => (
                <PortfolioCard key={alloc.id} alloc={alloc} expanded={expandedLead === alloc.leadId}
                  onToggle={() => setExpandedLead(expandedLead === alloc.leadId ? null : alloc.leadId)}
                  onRemove={() => removeFromPortfolio(alloc.leadId)}
                  selected={selectedLeads.has(alloc.leadId)}
                  onSelect={() => toggleLead(alloc.leadId)}
                  submitStatus={submittedLeads.get(alloc.leadId)} />
              ))}
              {filteredAllocations.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground/25">No companies match your filters</p>
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
                          onRemove={() => removeFromPortfolio(p.leadId)}
                          selected={selectedLeads.has(p.leadId)}
                          onSelect={() => toggleLead(p.leadId)}
                          submitStatus={submittedLeads.get(p.leadId)} />
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

function PortfolioCard({ alloc, expanded, onToggle, onRemove, selected, onSelect, submitStatus }: {
  alloc: any;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  selected?: boolean;
  onSelect?: () => void;
  submitStatus?: "success" | "blocked" | "failed" | "skipped" | "graceful";
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
    <Card className={`transition-all cursor-pointer border bg-card/40 ${selected ? "border-amber-400/25 bg-amber-950/5" : expanded ? "border-emerald-400/20 bg-card/60" : "border-emerald-500/8 hover:border-emerald-400/15"}`}
      onClick={onToggle} data-testid={`portfolio-card-${alloc.leadId}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {onSelect && (
              <button onClick={e => { e.stopPropagation(); onSelect(); }} data-testid={`checkbox-lead-${alloc.leadId}`}
                className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                  selected ? "bg-amber-400/20 border-amber-400/40 text-amber-200" : "border-emerald-500/15 hover:border-emerald-400/25"
                }`}>
                {selected && <CheckCircle className="w-3 h-3" />}
              </button>
            )}
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
            {forms.length > 0 && (
              <span className="text-emerald-400/40 flex items-center gap-0.5" title={`${forms.length} form(s) discovered`}>
                <Globe2 className="w-2.5 h-2.5" /><span className="tabular-nums">{forms.length}</span>
              </span>
            )}
            {submitStatus && (
              <span data-testid={`status-submit-${alloc.leadId}`}>
                {submitStatus === "success" && <CheckCircle className="w-3.5 h-3.5 text-emerald-400/60" title="Submitted" />}
                {submitStatus === "graceful" && <Leaf className="w-3.5 h-3.5 text-lime-400/50" title="Graceful skip" />}
                {submitStatus === "blocked" && <ShieldAlert className="w-3.5 h-3.5 text-orange-400/50" title="Blocked" />}
                {submitStatus === "failed" && <XCircle className="w-3.5 h-3.5 text-red-400/50" title="Failed" />}
                {submitStatus === "skipped" && <MinusCircle className="w-3.5 h-3.5 text-zinc-400/25" title="Skipped" />}
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
