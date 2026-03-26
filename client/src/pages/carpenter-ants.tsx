import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import {
  Bug, Upload, Play, Square, Trash2, Download, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Loader2, Phone,
  ChevronDown, ChevronUp, Zap, Shield, Globe, Activity,
  Signal, Wifi, PhoneOff, PhoneIncoming
} from "lucide-react";

interface CarpenterJob {
  id: string;
  status: string;
  totalNumbers: number;
  completed: number;
  failed: number;
  sourceFilename: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface SourceResult {
  source: string;
  available: boolean;
  lineType?: string;
  isActive?: boolean;
  carrier?: string;
  countryCode?: string;
  confidence?: number;
  error?: string;
  raw?: any;
}

interface StepResult {
  step: number;
  name: string;
  sources: SourceResult[];
  completedAt: string;
}

interface CarpenterResult {
  id: string;
  jobId: string;
  phoneRaw: string;
  phoneNormalized: string | null;
  countryCode: string | null;
  carrier: string | null;
  stepResults: StepResult[] | null;
  lineTypeVerdict: string | null;
  lineTypeConfidence: number | null;
  activeVerdict: string | null;
  activeConfidence: number | null;
  overallStatus: string;
  currentStep: number;
  errorMessage: string | null;
  createdAt: string;
}

interface ProgressData {
  running: boolean;
  jobId?: string;
  total?: number;
  completed?: number;
  failed?: number;
  currentAnts?: number;
  results?: Array<{
    resultId: string;
    phoneRaw: string;
    currentStep: number;
    totalSteps: number;
    status: string;
  }>;
}

const STEP_NAMES: Record<number, string> = {
  1: "PARSE",
  2: "Twilio LT",
  3: "Offline DB",
  4: "Free APIs",
  5: "Premium APIs",
  6: "Twilio Live",
  7: "CNAM/SIM",
  8: "Web/CRM",
  9: "Internal",
  10: "IPQS Deep",
};

function LineTypeBadge({ type }: { type: string | null }) {
  if (!type || type === "unknown") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400" data-testid="badge-line-unknown">unknown</span>;
  const colors: Record<string, string> = {
    cell: "bg-green-500/20 text-green-400 border-green-500/30",
    landline: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    voip: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    toll_free: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    premium: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const icons: Record<string, any> = {
    cell: Signal,
    landline: Phone,
    voip: Wifi,
    toll_free: PhoneIncoming,
    premium: Zap,
  };
  const Icon = icons[type] || Phone;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${colors[type] || "bg-gray-700 text-gray-400"}`} data-testid={`badge-line-${type}`}>
      <Icon className="w-2.5 h-2.5" />
      {type.replace("_", " ")}
    </span>
  );
}

function ActiveBadge({ status }: { status: string | null }) {
  if (!status || status === "unknown") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400" data-testid="badge-active-unknown">unknown</span>;
  if (status === "active") {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30 inline-flex items-center gap-1" data-testid="badge-active-yes">
        <Activity className="w-2.5 h-2.5" />active
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30 inline-flex items-center gap-1" data-testid="badge-active-no">
      <PhoneOff className="w-2.5 h-2.5" />inactive
    </span>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5" data-testid="confidence-bar">
      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gray-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function StepProgressDots({ currentStep, totalSteps, status }: { currentStep: number; totalSteps: number; status: string }) {
  return (
    <div className="flex items-center gap-0.5" data-testid="step-progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const completed = stepNum <= currentStep;
        const isCurrent = stepNum === currentStep && status === "processing";
        return (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              completed ? "bg-green-500" : isCurrent ? "bg-yellow-500 animate-pulse" : "bg-gray-700"
            }`}
            title={STEP_NAMES[stepNum] || `Step ${stepNum}`}
          />
        );
      })}
    </div>
  );
}

export default function CarpenterAntsPage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const [csvText, setCsvText] = useState("");
  const [viewingJobId, setViewingJobId] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<CarpenterJob[]>({
    queryKey: ["/api/carpenter/jobs"],
    refetchInterval: 5000,
  });

  const { data: progress } = useQuery<ProgressData>({
    queryKey: ["/api/carpenter/progress"],
    refetchInterval: 1500,
  });

  const { data: results = [], isLoading: resultsLoading } = useQuery<CarpenterResult[]>({
    queryKey: ["/api/carpenter/jobs", viewingJobId, "results"],
    queryFn: () => fetch(`/api/carpenter/jobs/${viewingJobId}/results`, { credentials: "include" }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: !!viewingJobId,
    refetchInterval: progress?.running ? 3000 : false,
  });

  const { data: sources } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/carpenter/sources"],
  });

  useEffect(() => {
    if (jobs.length > 0 && !viewingJobId) {
      setViewingJobId(jobs[0].id);
    }
  }, [jobs]);

  const startJob = useMutation({
    mutationFn: async () => {
      const phones = csvText
        .split(/[\n,;]+/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      if (phones.length === 0) throw new Error("No phone numbers found");
      if (phones.length > 100) throw new Error("Maximum 100 phone numbers");

      const resp = await apiRequest("POST", "/api/carpenter/jobs", { phones });
      return resp.json();
    },
    onSuccess: (data) => {
      toast({ title: "Carpenter Ants deployed!", description: `${data.total} numbers queued` });
      setViewingJobId(data.jobId);
      setCsvText("");
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const stopJob = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/carpenter/jobs/${jobId}/stop`),
    onSuccess: () => {
      toast({ title: "Stop requested" });
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/progress"] });
    },
  });

  const deleteJob = useMutation({
    mutationFn: (jobId: string) => apiRequest("DELETE", `/api/carpenter/jobs/${jobId}`),
    onSuccess: () => {
      if (viewingJobId) setViewingJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] });
      toast({ title: "Job deleted" });
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvText(text);
      toast({ title: `Loaded ${file.name}`, description: `${text.split(/[\n,;]+/).filter(p => p.trim()).length} numbers found` });
    };
    reader.readAsText(file);
  }, []);

  const phoneCount = csvText.split(/[\n,;]+/).map(p => p.trim()).filter(p => p.length > 0).length;

  const exportCsv = () => {
    if (results.length === 0) return;
    const headers = ["Phone Raw", "Phone Normalized", "Line Type", "Line Confidence", "Active Status", "Active Confidence", "Carrier", "Status"];
    const rows = results.map(r => [
      r.phoneRaw,
      r.phoneNormalized || "",
      r.lineTypeVerdict || "",
      r.lineTypeConfidence !== null ? String(Math.round(r.lineTypeConfidence * 100)) + "%" : "",
      r.activeVerdict || "",
      r.activeConfidence !== null ? String(Math.round(r.activeConfidence * 100)) + "%" : "",
      r.carrier || "",
      r.overallStatus,
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carpenter-ants-results-${viewingJobId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeJob = jobs.find(j => j.status === "running");
  const currentJob = viewingJobId ? jobs.find(j => j.id === viewingJobId) : null;

  const availableCount = sources ? Object.values(sources).filter(Boolean).length : 0;
  const totalSources = sources ? Object.keys(sources).length : 16;

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 space-y-4" data-testid="carpenter-ants-page">
      <div className="flex items-center gap-3 mb-4">
        <Bug className="w-6 h-6 text-amber-400" />
        <h1 className="text-xl font-bold text-white tracking-wide" data-testid="text-page-title">Carpenter Ants</h1>
        <span className="text-xs text-gray-500 ml-2">Phone Number Intelligence Pipeline</span>
        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30 ml-auto">
          33 ants | 10 steps | {availableCount}/{totalSources} sources
        </span>
      </div>

      {/* Source Availability Panel */}
      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="sources-panel">
        <button
          onClick={() => setSourcesOpen(!sourcesOpen)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-900 transition-colors"
          data-testid="button-toggle-sources"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Verification Sources</span>
            <span className="text-xs text-gray-500">({availableCount}/{totalSources} active)</span>
          </div>
          {sourcesOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>
        {sourcesOpen && sources && (
          <div className="p-4 border-t border-gray-800 grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(sources).map(([name, available]) => (
              <div key={name} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${available ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`} data-testid={`source-${name}`}>
                {available ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {name.replace(/_/g, " ")}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Panel */}
      <div className="border border-gray-700 rounded-lg bg-gray-950 p-4 space-y-3" data-testid="upload-panel">
        <div className="flex items-center gap-2 mb-2">
          <Upload className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-white">Upload Phone Numbers</span>
          <span className="text-[10px] text-gray-500">(max 100, CSV/paste)</span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={"Paste phone numbers here (one per line, CSV, or semicolon-separated):\n(555) 123-4567\n555-987-6543\n+1 555 246 8000"}
              className="w-full h-28 bg-gray-900 border border-gray-700 rounded text-xs text-gray-200 p-2 font-mono placeholder-gray-600 resize-none"
              data-testid="input-phones"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-500">
                {phoneCount > 0 ? `${phoneCount} number${phoneCount !== 1 ? "s" : ""} detected` : "No numbers entered"}
                {phoneCount > 100 && <span className="text-red-400 ml-2">exceeds 100 limit</span>}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 border border-gray-700 rounded px-2 py-0.5"
                  data-testid="button-upload-file"
                >
                  <Upload className="w-2.5 h-2.5" />
                  upload CSV
                </button>
                <button
                  onClick={() => startJob.mutate()}
                  disabled={phoneCount === 0 || phoneCount > 100 || startJob.isPending || !!activeJob}
                  className="text-[10px] font-semibold text-black bg-amber-400 hover:bg-amber-300 disabled:bg-gray-700 disabled:text-gray-500 rounded px-3 py-1 flex items-center gap-1 transition-colors"
                  data-testid="button-start-job"
                >
                  {startJob.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Deploy Ants
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Progress */}
      {progress?.running && (
        <div className="border border-amber-500/30 rounded-lg bg-amber-500/5 p-4 space-y-3" data-testid="progress-panel">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
              <span className="text-sm font-semibold text-amber-400">Processing — {progress.currentAnts} ants active</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {progress.completed}/{progress.total} done
                {(progress.failed || 0) > 0 && <span className="text-red-400 ml-1">({progress.failed} failed)</span>}
              </span>
              <button
                onClick={() => progress.jobId && stopJob.mutate(progress.jobId)}
                className="text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded px-2 py-0.5 flex items-center gap-1"
                data-testid="button-stop-job"
              >
                <Square className="w-2.5 h-2.5" />
                stop
              </button>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${progress.total ? Math.round(((progress.completed || 0) / progress.total) * 100) : 0}%` }}
            />
          </div>
          {progress.results && progress.results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1.5 max-h-32 overflow-y-auto">
              {progress.results.filter(r => r.status === "processing").map(r => (
                <div key={r.resultId} className="flex items-center gap-1.5 bg-gray-900/50 rounded px-2 py-1 text-[10px]">
                  <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin flex-shrink-0" />
                  <span className="text-gray-300 truncate font-mono">{r.phoneRaw.slice(-4)}</span>
                  <StepProgressDots currentStep={r.currentStep} totalSteps={r.totalSteps} status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Job History */}
      <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="jobs-panel">
        <div className="flex items-center justify-between p-3 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">Job History</span>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/carpenter/jobs"] })}
            className="text-[10px] text-gray-400 hover:text-gray-200"
            data-testid="button-refresh-jobs"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {jobsLoading ? (
          <div className="p-4 text-center text-gray-500 text-xs"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
        ) : jobs.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">No jobs yet. Upload phone numbers to begin.</div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-48 overflow-y-auto">
            {jobs.map(job => (
              <div
                key={job.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-900/50 transition-colors ${viewingJobId === job.id ? "bg-gray-900 border-l-2 border-amber-400" : ""}`}
                onClick={() => setViewingJobId(job.id)}
                data-testid={`job-row-${job.id}`}
              >
                <div className="flex items-center gap-2">
                  {job.status === "running" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
                  {job.status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                  {job.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                  {job.status === "stopped" && <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                  <span className="text-xs text-gray-300">
                    {job.totalNumbers} numbers
                    {job.sourceFilename && <span className="text-gray-500 ml-1">({job.sourceFilename})</span>}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500">
                    {job.completed}/{job.totalNumbers}
                    {job.failed > 0 && <span className="text-red-400 ml-1">({job.failed}err)</span>}
                  </span>
                  <span className="text-[10px] text-gray-600">{new Date(job.createdAt).toLocaleString()}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteJob.mutate(job.id); }}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                    data-testid={`button-delete-job-${job.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Table */}
      {viewingJobId && (
        <div className="border border-gray-700 rounded-lg bg-gray-950" data-testid="results-panel">
          <div className="flex items-center justify-between p-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Results</span>
              {currentJob && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  currentJob.status === "completed" ? "bg-green-500/20 text-green-400" :
                  currentJob.status === "running" ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                  currentJob.status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-gray-700 text-gray-400"
                }`}>
                  {currentJob.status}
                </span>
              )}
            </div>
            {results.length > 0 && (
              <button
                onClick={exportCsv}
                className="text-[10px] text-gray-400 hover:text-gray-200 flex items-center gap-1 border border-gray-700 rounded px-2 py-0.5"
                data-testid="button-export-csv"
              >
                <Download className="w-2.5 h-2.5" />
                export CSV
              </button>
            )}
          </div>

          {resultsLoading ? (
            <div className="p-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-500" /></div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-xs">No results yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="results-table">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Normalized</th>
                    <th className="px-3 py-2 text-left">Line Type</th>
                    <th className="px-3 py-2 text-left">Conf.</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Conf.</th>
                    <th className="px-3 py-2 text-left">Carrier</th>
                    <th className="px-3 py-2 text-left">Steps</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {results.map(r => (
                    <>
                      <tr
                        key={r.id}
                        className={`hover:bg-gray-900/50 cursor-pointer transition-colors ${expandedResult === r.id ? "bg-gray-900" : ""}`}
                        onClick={() => setExpandedResult(expandedResult === r.id ? null : r.id)}
                        data-testid={`result-row-${r.id}`}
                      >
                        <td className="px-3 py-2 font-mono text-gray-300">{r.phoneRaw}</td>
                        <td className="px-3 py-2 font-mono text-gray-400">{r.phoneNormalized || "—"}</td>
                        <td className="px-3 py-2"><LineTypeBadge type={r.lineTypeVerdict} /></td>
                        <td className="px-3 py-2"><ConfidenceBar value={r.lineTypeConfidence} /></td>
                        <td className="px-3 py-2"><ActiveBadge status={r.activeVerdict} /></td>
                        <td className="px-3 py-2"><ConfidenceBar value={r.activeConfidence} /></td>
                        <td className="px-3 py-2 text-gray-400 truncate max-w-[120px]">{r.carrier || "—"}</td>
                        <td className="px-3 py-2">
                          <StepProgressDots currentStep={r.currentStep} totalSteps={10} status={r.overallStatus} />
                        </td>
                        <td className="px-3 py-2">
                          {r.overallStatus === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                          {r.overallStatus === "processing" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
                          {r.overallStatus === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                          {r.overallStatus === "pending" && <span className="text-gray-600 text-[10px]">pending</span>}
                        </td>
                      </tr>
                      {expandedResult === r.id && r.stepResults && (
                        <tr key={`${r.id}-detail`}>
                          <td colSpan={9} className="px-3 py-3 bg-gray-900/80">
                            <div className="space-y-2">
                              {r.errorMessage && (
                                <div className="text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded">{r.errorMessage}</div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                                {(r.stepResults as StepResult[]).map(step => (
                                  <div key={step.step} className="border border-gray-800 rounded p-2 bg-gray-950/50">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[10px] font-semibold text-gray-300">Step {step.step}: {STEP_NAMES[step.step]}</span>
                                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                                    </div>
                                    <div className="space-y-0.5">
                                      {step.sources.map((src, si) => (
                                        <div key={si} className="flex items-center justify-between text-[9px]">
                                          <span className={src.available ? "text-gray-400" : "text-gray-600"}>
                                            {src.source.replace(/_/g, " ")}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {src.available ? (
                                              <>
                                                {src.lineType && src.lineType !== "unknown" && (
                                                  <span className="text-blue-400">{src.lineType}</span>
                                                )}
                                                {src.isActive !== undefined && (
                                                  <span className={src.isActive ? "text-green-400" : "text-red-400"}>
                                                    {src.isActive ? "active" : "inactive"}
                                                  </span>
                                                )}
                                                {src.confidence !== undefined && (
                                                  <span className="text-gray-600">{Math.round(src.confidence * 100)}%</span>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-gray-600 italic">{src.error ? "unavail" : "off"}</span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
