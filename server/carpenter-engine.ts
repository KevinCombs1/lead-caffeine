import { storage } from "./storage";
import type { CarpenterAntResult } from "@shared/schema";
import {
  sourceLibphonenumber, sourceFccBlocks, sourceNpanxx,
  sourceTwilioLineType, sourceNumVerify, sourceAbstractAPI,
  sourceIpqsLineType, sourceIpqsActive, sourceVeriphone,
  sourceTwilioCnam, sourceTwilioSimSwap, sourceTwilioLiveActivity,
  sourceBraveSearch, sourceHubspot,
  sourcePhoneAuthHeuristics, sourceDbFrequency,
  type SourceResult,
} from "./carpenter-sources";
import { getProxyCount } from "./carpenter-proxy";
import { db } from "./db";
import { carpenterAntResults } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const ANT_COUNT = 399;
const ANT_WAVE_SIZE = 50;
const ANT_WAVE_DELAY_MS = 2000;

interface StepResult {
  step: number;
  name: string;
  sources: SourceResult[];
  completedAt: string;
}

interface PipelineProgress {
  resultId: string;
  phoneRaw: string;
  currentStep: number;
  totalSteps: number;
  status: "processing" | "completed" | "failed";
}

type ProgressCallback = (progress: JobProgress) => void;

export interface JobProgress {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  currentAnts: number;
  results: PipelineProgress[];
}

const activeJobs = new Map<string, CarpenterAntEngine>();

interface GlobalSnapshot {
  running: boolean;
  activeJobs: JobProgress[];
}
export type GlobalProgressCallback = (snapshot: GlobalSnapshot) => void;
const globalProgressListeners = new Set<GlobalProgressCallback>();

export function onGlobalProgress(cb: GlobalProgressCallback): () => void {
  globalProgressListeners.add(cb);
  return () => globalProgressListeners.delete(cb);
}

function emitGlobalSnapshot() {
  const jobs = Array.from(activeJobs.values())
    .filter(e => e.isRunning())
    .map(e => e.getProgress());
  const snapshot: GlobalSnapshot = {
    running: jobs.length > 0,
    activeJobs: jobs,
  };
  for (const cb of globalProgressListeners) {
    try { cb(snapshot); } catch {}
  }
}

export function getActiveJobs(): Map<string, CarpenterAntEngine> {
  return activeJobs;
}

export function getJobEngine(jobId: string): CarpenterAntEngine | undefined {
  return activeJobs.get(jobId);
}

function normalizeUSPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

async function safeSourceCall(fn: () => Promise<SourceResult>, sourceName: string): Promise<SourceResult> {
  try {
    return await fn();
  } catch (err: any) {
    return { source: sourceName, available: false, error: err.message || "unknown error" };
  }
}

async function runStep1Parse(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const libResult = await safeSourceCall(() => sourceLibphonenumber(phone), "libphonenumber");
  return {
    step: 1,
    name: "PARSE",
    sources: [libResult],
    completedAt: new Date().toISOString(),
  };
}

async function runStep2LineTypeRound1(phone: string, proxyIndex?: number): Promise<StepResult> {
  const result = await safeSourceCall(() => sourceTwilioLineType(phone, proxyIndex), "twilio_line_type");
  return {
    step: 2,
    name: "LINE_TYPE_R1_TWILIO",
    sources: [result],
    completedAt: new Date().toISOString(),
  };
}

async function runStep3LineTypeRound2(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const [fcc, npanxx, libphone] = await Promise.all([
    safeSourceCall(() => sourceFccBlocks(phone), "fcc_blocks"),
    safeSourceCall(() => sourceNpanxx(phone), "npanxx"),
    safeSourceCall(() => sourceLibphonenumber(phone), "libphonenumber"),
  ]);
  return {
    step: 3,
    name: "LINE_TYPE_R2_OFFLINE",
    sources: [fcc, npanxx, libphone],
    completedAt: new Date().toISOString(),
  };
}

async function runStep4LineTypeRound3(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [numverify, abstractapi] = await Promise.all([
    safeSourceCall(() => sourceNumVerify(phone, proxyIndex), "numverify"),
    safeSourceCall(() => sourceAbstractAPI(phone, proxyIndex), "abstractapi"),
  ]);
  return {
    step: 4,
    name: "LINE_TYPE_R3_FREE_APIS",
    sources: [numverify, abstractapi],
    completedAt: new Date().toISOString(),
  };
}

async function runStep5LineTypeRound4(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [ipqs, veriphone] = await Promise.all([
    safeSourceCall(() => sourceIpqsLineType(phone, proxyIndex), "ipqs_line_type"),
    safeSourceCall(() => sourceVeriphone(phone, proxyIndex), "veriphone"),
  ]);
  return {
    step: 5,
    name: "LINE_TYPE_R4_PREMIUM",
    sources: [ipqs, veriphone],
    completedAt: new Date().toISOString(),
  };
}

async function runStep6ActiveRound1(phone: string, proxyIndex?: number): Promise<StepResult> {
  const result = await safeSourceCall(() => sourceTwilioLiveActivity(phone, proxyIndex), "twilio_live_activity");
  return {
    step: 6,
    name: "ACTIVE_R1_TWILIO_LIVE",
    sources: [result],
    completedAt: new Date().toISOString(),
  };
}

async function runStep7ActiveRound2(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [cnam, simSwap] = await Promise.all([
    safeSourceCall(() => sourceTwilioCnam(phone, proxyIndex), "twilio_cnam"),
    safeSourceCall(() => sourceTwilioSimSwap(phone, proxyIndex), "twilio_sim_swap"),
  ]);
  return {
    step: 7,
    name: "ACTIVE_R2_CNAM_SIM",
    sources: [cnam, simSwap],
    completedAt: new Date().toISOString(),
  };
}

async function runStep8ActiveRound3(phone: string, proxyIndex?: number): Promise<StepResult> {
  const [brave, hubspot] = await Promise.all([
    safeSourceCall(() => sourceBraveSearch(phone, proxyIndex), "brave_search"),
    safeSourceCall(() => sourceHubspot(phone, proxyIndex), "hubspot"),
  ]);
  return {
    step: 8,
    name: "ACTIVE_R3_WEB_CRM",
    sources: [brave, hubspot],
    completedAt: new Date().toISOString(),
  };
}

async function runStep9ActiveRound4(phone: string, _proxyIndex?: number): Promise<StepResult> {
  const [heuristics, dbFreq] = await Promise.all([
    safeSourceCall(() => sourcePhoneAuthHeuristics(phone), "phone_auth_heuristics"),
    safeSourceCall(() => sourceDbFrequency(phone), "db_frequency"),
  ]);
  return {
    step: 9,
    name: "ACTIVE_R4_INTERNAL",
    sources: [heuristics, dbFreq],
    completedAt: new Date().toISOString(),
  };
}

async function runStep10ActiveRound5(phone: string, proxyIndex?: number): Promise<StepResult> {
  const ipqsActive = await safeSourceCall(() => sourceIpqsActive(phone, proxyIndex), "ipqs_active");
  return {
    step: 10,
    name: "ACTIVE_R5_IPQS_DEEP",
    sources: [ipqsActive],
    completedAt: new Date().toISOString(),
  };
}

const LINE_TYPE_BATCH: Array<(phone: string, proxyIndex?: number) => Promise<StepResult>> = [
  runStep2LineTypeRound1, runStep3LineTypeRound2,
  runStep4LineTypeRound3, runStep5LineTypeRound4,
];

const ACTIVE_BATCH: Array<(phone: string, proxyIndex?: number) => Promise<StepResult>> = [
  runStep6ActiveRound1, runStep7ActiveRound2,
  runStep8ActiveRound3, runStep9ActiveRound4,
  runStep10ActiveRound5,
];

interface VerdictWeights {
  [source: string]: number;
}

const LINE_TYPE_WEIGHTS: VerdictWeights = {
  twilio_line_type: 3.0,
  ipqs_line_type: 2.0,
  numverify: 1.5,
  abstractapi: 1.5,
  veriphone: 1.5,
  libphonenumber: 1.0,
  fcc_blocks: 1.0,
  npanxx: 0.8,
};

const ACTIVE_WEIGHTS: VerdictWeights = {
  twilio_live_activity: 3.0,
  twilio_cnam: 2.0,
  twilio_sim_swap: 1.5,
  ipqs_active: 2.5,
  brave_search: 1.0,
  hubspot: 1.0,
  phone_auth_heuristics: 0.8,
  db_frequency: 0.7,
  numverify: 1.0,
  abstractapi: 1.0,
  veriphone: 1.0,
};

function computeLineTypeVerdict(allSources: SourceResult[]): { verdict: string; confidence: number; carrier?: string } {
  const votes: Record<string, number> = {};
  let totalWeight = 0;
  let carrier: string | undefined;

  for (const s of allSources) {
    if (!s.available || !s.lineType || s.lineType === "unknown") continue;
    const weight = LINE_TYPE_WEIGHTS[s.source] || 1.0;
    const effectiveWeight = weight * (s.confidence || 0.5);
    votes[s.lineType] = (votes[s.lineType] || 0) + effectiveWeight;
    totalWeight += effectiveWeight;
    if (s.carrier && !carrier) carrier = s.carrier;
  }

  if (totalWeight === 0) return { verdict: "unknown", confidence: 0 };

  let bestType = "unknown";
  let bestScore = 0;
  for (const [type, score] of Object.entries(votes)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const confidence = Math.min(bestScore / totalWeight, 1.0);
  return { verdict: bestType, confidence: Math.round(confidence * 100) / 100, carrier };
}

function computeActiveVerdict(allSources: SourceResult[]): { verdict: string; confidence: number } {
  let activeScore = 0;
  let inactiveScore = 0;
  let totalWeight = 0;

  for (const s of allSources) {
    if (!s.available || s.isActive === undefined) continue;
    const weight = ACTIVE_WEIGHTS[s.source] || 1.0;
    const effectiveWeight = weight * (s.confidence || 0.5);
    if (s.isActive) {
      activeScore += effectiveWeight;
    } else {
      inactiveScore += effectiveWeight;
    }
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return { verdict: "unknown", confidence: 0 };

  const activeRatio = activeScore / (activeScore + inactiveScore);
  const verdict = activeRatio >= 0.5 ? "active" : "inactive";
  const confidence = Math.round(Math.abs(activeRatio - 0.5) * 2 * 100) / 100;
  return { verdict, confidence: Math.min(confidence, 1.0) };
}

async function resilientDbUpdate(resultId: string, data: Partial<CarpenterAntResult>): Promise<void> {
  try {
    await storage.updateCarpenterResult(resultId, data);
  } catch (err: any) {
    await new Promise(r => setTimeout(r, 500));
    try {
      await storage.updateCarpenterResult(resultId, data);
    } catch (retryErr: any) {
      console.error(`[carpenter] DB write failed for result ${resultId} after retry: ${retryErr.message}`);
    }
  }
}

export class CarpenterAntEngine {
  private jobId: string = "";
  private stopped = false;
  private phones: string[] = [];
  private resultIds: string[] = [];
  private completedCount = 0;
  private failedCount = 0;
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private antProgress: Map<string, PipelineProgress> = new Map();

  isRunning(): boolean {
    return !this.stopped && this.jobId !== "";
  }

  getJobId(): string {
    return this.jobId;
  }

  onProgress(cb: ProgressCallback): () => void {
    this.progressCallbacks.add(cb);
    return () => this.progressCallbacks.delete(cb);
  }

  private emitProgress() {
    const progress: JobProgress = {
      jobId: this.jobId,
      total: this.phones.length,
      completed: this.completedCount,
      failed: this.failedCount,
      currentAnts: this.stopped ? 0 : Math.min(ANT_COUNT, this.phones.length - this.completedCount - this.failedCount),
      results: Array.from(this.antProgress.values()),
    };
    for (const cb of this.progressCallbacks) {
      try { cb(progress); } catch {}
    }
    emitGlobalSnapshot();
  }

  private cleanup() {
    this.progressCallbacks.clear();
    this.antProgress.clear();
  }

  getProgress(): JobProgress {
    return {
      jobId: this.jobId,
      total: this.phones.length,
      completed: this.completedCount,
      failed: this.failedCount,
      currentAnts: this.stopped ? 0 : Math.min(ANT_COUNT, this.phones.length - this.completedCount - this.failedCount),
      results: Array.from(this.antProgress.values()),
    };
  }

  async start(phones: string[], sourceFilename?: string): Promise<string> {
    if (phones.length === 0) throw new Error("No phone numbers provided");
    if (phones.length > 50000) throw new Error("Maximum 50,000 phone numbers per job");

    const job = await storage.createCarpenterJob({
      status: "running",
      totalNumbers: phones.length,
      completed: 0,
      failed: 0,
      sourceFilename: sourceFilename || null,
    });

    this.jobId = job.id;
    this.phones = phones;
    this.stopped = false;
    this.completedCount = 0;
    this.failedCount = 0;
    this.antProgress.clear();
    activeJobs.set(this.jobId, this);

    const resultInserts = phones.map(p => ({
      jobId: this.jobId,
      phoneRaw: p,
      phoneNormalized: normalizeUSPhone(p),
      overallStatus: "pending" as const,
      currentStep: 0,
    }));

    const results = await storage.bulkCreateCarpenterResults(resultInserts);
    this.resultIds = results.map(r => r.id);

    this.runPipelineSafe();
    return this.jobId;
  }

  stop() {
    this.stopped = true;
  }

  private async cleanupOrphanedResults() {
    try {
      const orphanStatuses = ["pending", "processing"];
      await db.update(carpenterAntResults)
        .set({
          overallStatus: "failed",
          errorMessage: "job terminated before completion",
        })
        .where(
          and(
            eq(carpenterAntResults.jobId, this.jobId),
            inArray(carpenterAntResults.overallStatus, orphanStatuses),
          )
        );
    } catch (err: any) {
      console.error(`[carpenter] orphan cleanup failed for job ${this.jobId}: ${err.message}`);
    }
  }

  private async runPipelineSafe() {
    try {
      await this.runPipeline();
    } catch (err: any) {
      try {
        await storage.updateCarpenterJob(this.jobId, {
          status: "failed",
          completedAt: new Date(),
        });
      } catch {}
    } finally {
      await this.cleanupOrphanedResults();
      this.stopped = true;
      activeJobs.delete(this.jobId);
      emitGlobalSnapshot();
      this.cleanup();
    }
  }

  private async runPipeline() {
    const queue = [...this.resultIds];
    let queueIdx = 0;
    const proxyCount = getProxyCount();

    const worker = async (antId: number) => {
      const proxyIndex = proxyCount > 0 ? antId % proxyCount : undefined;

      while (!this.stopped) {
        const idx = queueIdx++;
        if (idx >= queue.length) break;

        const resultId = queue[idx];
        const phone = this.phones[idx];

        this.antProgress.set(resultId, {
          resultId,
          phoneRaw: phone,
          currentStep: 0,
          totalSteps: 10,
          status: "processing",
        });

        try {
          await resilientDbUpdate(resultId, { overallStatus: "processing", currentStep: 0 });

          const allStepResults: StepResult[] = [];
          const allSources: SourceResult[] = [];

          if (this.stopped) break;
          const parseResult = await runStep1Parse(phone, proxyIndex);
          allStepResults.push(parseResult);
          allSources.push(...parseResult.sources);

          this.antProgress.set(resultId, {
            resultId, phoneRaw: phone, currentStep: 1, totalSteps: 10, status: "processing",
          });
          await resilientDbUpdate(resultId, {
            currentStep: 1,
            stepResults: JSON.parse(JSON.stringify(allStepResults)),
          });
          this.emitProgress();

          if (this.stopped) break;
          const lineTypeResults = await Promise.all(
            LINE_TYPE_BATCH.map(runner => runner(phone, proxyIndex))
          );
          allStepResults.push(...lineTypeResults);
          for (const r of lineTypeResults) allSources.push(...r.sources);

          this.antProgress.set(resultId, {
            resultId, phoneRaw: phone, currentStep: 5, totalSteps: 10, status: "processing",
          });
          await resilientDbUpdate(resultId, {
            currentStep: 5,
            stepResults: JSON.parse(JSON.stringify(allStepResults)),
          });
          this.emitProgress();

          if (this.stopped) break;
          const activeResults = await Promise.all(
            ACTIVE_BATCH.map(runner => runner(phone, proxyIndex))
          );
          allStepResults.push(...activeResults);
          for (const r of activeResults) allSources.push(...r.sources);

          this.antProgress.set(resultId, {
            resultId, phoneRaw: phone, currentStep: 10, totalSteps: 10, status: "processing",
          });

          if (this.stopped) break;

          const lineVerdict = computeLineTypeVerdict(allSources);
          const activeVerdict = computeActiveVerdict(allSources);

          await resilientDbUpdate(resultId, {
            lineTypeVerdict: lineVerdict.verdict,
            lineTypeConfidence: lineVerdict.confidence,
            activeVerdict: activeVerdict.verdict,
            activeConfidence: activeVerdict.confidence,
            carrier: lineVerdict.carrier || null,
            overallStatus: "completed",
            currentStep: 10,
            stepResults: JSON.parse(JSON.stringify(allStepResults)),
          });

          this.completedCount++;
          this.antProgress.set(resultId, {
            resultId,
            phoneRaw: phone,
            currentStep: 10,
            totalSteps: 10,
            status: "completed",
          });
        } catch (err: any) {
          this.failedCount++;
          this.antProgress.set(resultId, {
            resultId,
            phoneRaw: phone,
            currentStep: 0,
            totalSteps: 10,
            status: "failed",
          });
          await resilientDbUpdate(resultId, {
            overallStatus: "failed",
            errorMessage: err.message,
          });
        }

        try {
          await storage.updateCarpenterJob(this.jobId, {
            completed: this.completedCount,
            failed: this.failedCount,
          });
        } catch {}
        this.emitProgress();
      }
    };

    const antCount = Math.min(ANT_COUNT, queue.length);
    const workers: Promise<void>[] = [];

    for (let i = 0; i < antCount; i++) {
      workers.push(worker(i));
      if ((i + 1) % ANT_WAVE_SIZE === 0 && i + 1 < antCount) {
        await new Promise(r => setTimeout(r, ANT_WAVE_DELAY_MS));
      }
    }

    await Promise.all(workers);

    const finalStatus = this.stopped ? "stopped" : "completed";
    await storage.updateCarpenterJob(this.jobId, {
      status: finalStatus,
      completed: this.completedCount,
      failed: this.failedCount,
      completedAt: new Date(),
    });

    this.emitProgress();
  }
}
