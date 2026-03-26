import { useState } from "react";
import {
  Flower2, Bug, Shield, Globe, Search, Database,
  Activity, Network, Eye, Lock, Cpu, Layers, Target,
  ChevronDown, ChevronUp, ArrowRight, Boxes, Antenna, Radar,
  Workflow, Brain, Fingerprint, Satellite, Crown, Swords
} from "lucide-react";

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor: string;
}

function CollapsibleSection({ title, icon, children, defaultOpen = false, accentColor }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${accentColor}`} data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
        data-testid={`button-toggle-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold tracking-wide">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-white/5">{children}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, sub, icon }: StatCardProps) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4 flex flex-col gap-1" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

interface PipelineStepProps {
  step: number;
  name: string;
  sources: string[];
  category: "parse" | "linetype" | "active" | "deep";
}

function PipelineStep({ step, name, sources, category }: PipelineStepProps) {
  const colors = {
    parse: "border-blue-500/20 bg-blue-500/5",
    linetype: "border-amber-500/20 bg-amber-500/5",
    active: "border-emerald-500/20 bg-emerald-500/5",
    deep: "border-violet-500/20 bg-violet-500/5",
  };
  const textColors = {
    parse: "text-blue-400",
    linetype: "text-amber-400",
    active: "text-emerald-400",
    deep: "text-violet-400",
  };
  return (
    <div className={`border rounded-md p-3 ${colors[category]}`} data-testid={`pipeline-step-${step}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${textColors[category]}`}>STEP {step}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{name}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {sources.map((s) => (
          <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/5 font-mono">{s}</span>
        ))}
      </div>
    </div>
  );
}

export default function ManifestoPage() {
  return (
    <div className="min-h-screen bg-background p-6" data-testid="page-manifesto">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="text-center space-y-4 py-8">
          <div className="flex items-center justify-center gap-4">
            <Flower2 className="w-10 h-10 text-amber-400" />
            <span className="text-3xl text-muted-foreground/30 font-thin">+</span>
            <Bug className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground" data-testid="text-manifesto-title">
            The Manifesto
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A technical doctrine for two intelligence systems — the Beauteous Brigade (Hive Engine) 
            and the Carpenter Ants — operating in concert as autonomous discovery and verification machines 
            within D.A.T.A. Cloudware.
          </p>
          <div className="flex items-center justify-center gap-6 pt-2">
            <span className="text-[10px] uppercase tracking-widest text-amber-400/60 font-medium">Beauteous Brigade</span>
            <span className="text-muted-foreground/20">|</span>
            <span className="text-[10px] uppercase tracking-widest text-red-400/60 font-medium">Carpenter Ants</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Hive Workers" value="640" sub="Parallel crawl capacity" icon={<Flower2 className="w-3 h-3 text-amber-400" />} />
          <StatCard label="Ant Workers" value="399" sub="Concurrent verification ants" icon={<Bug className="w-3 h-3 text-red-400" />} />
          <StatCard label="Directories" value="26" sub="6 active, 20 blocked/dead" icon={<Globe className="w-3 h-3 text-cyan-400" />} />
          <StatCard label="Intel Sources" value="16" sub="Offline + online sources" icon={<Database className="w-3 h-3 text-emerald-400" />} />
        </div>

        <div className="border border-white/5 rounded-lg p-6 bg-white/[0.01]">
          <div className="flex items-center gap-3 mb-4">
            <Crown className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-foreground">Preamble</h2>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              The Beauteous Brigade and Carpenter Ants are autonomous intelligence pipelines designed 
              to operate at scale without human intervention. The Brigade discovers businesses across 
              the surface web — flowers with websites, pollen without — while the Carpenter Ants verify 
              the phone numbers those businesses carry.
            </p>
            <p>
              Together they form a closed-loop intelligence cycle: <strong className="text-foreground">discover, classify, verify</strong>. 
              Every flower harvested by the Hive can have its phone number routed through the 
              Carpenter Ants' 10-step pipeline. Every verified number enriches the flower's record 
              for downstream portfolio allocation and Bumblebee form submission.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Flower2 className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-foreground">I. Beauteous Brigade — The Hive Engine</h2>
          </div>

          <CollapsibleSection
            title="Ray of Grace — The Crawl Engine"
            icon={<Search className="w-4 h-4 text-amber-400" />}
            defaultOpen={true}
            accentColor="border-amber-500/10"
          >
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Ray of Grace is the core crawl engine that powers the Beauteous Brigade. It 
                coordinates 640 parallel workers across multiple business directories, generating 
                a combinatorial matrix of <strong className="text-foreground">Category x Location x Directory</strong> combos 
                and dispatching them through a resilient, rate-limited pipeline.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Engine Parameters</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Worker Pool</span><span className="text-foreground font-mono">640 concurrent</span></div>
                    <div className="flex justify-between"><span>Per-Domain Concurrency</span><span className="text-foreground font-mono">2 max</span></div>
                    <div className="flex justify-between"><span>Request Cooldown</span><span className="text-foreground font-mono">15.4 — 24.2s</span></div>
                    <div className="flex justify-between"><span>Domain Gap</span><span className="text-foreground font-mono">26.4s minimum</span></div>
                    <div className="flex justify-between"><span>Combo Timeout</span><span className="text-foreground font-mono">5 min/combo</span></div>
                    <div className="flex justify-between"><span>Failure Threshold</span><span className="text-foreground font-mono">5 consecutive</span></div>
                    <div className="flex justify-between"><span>Suspension Cooldown</span><span className="text-foreground font-mono">3 minutes</span></div>
                    <div className="flex justify-between"><span>Metrics Interval</span><span className="text-foreground font-mono">Every 200 combos</span></div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Resilience Mechanisms</h4>
                  <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span><strong className="text-foreground">Interleaved Round-Robin</strong> — Combo queue shuffled across directories so no single site is hammered sequentially</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span><strong className="text-foreground">Domain Gate</strong> — Semaphore-based concurrency limiter per scraper domain with enforced minimum gap</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span><strong className="text-foreground">Adaptive Suspension</strong> — 5 consecutive failures triggers 3-min cooldown; workers skip suspended directories</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span><strong className="text-foreground">Per-Combo Timeout</strong> — 5-minute hard limit prevents hung workers from blocking the pool</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Directory Arsenal — 26 Sites Across 6 Continents"
            icon={<Globe className="w-4 h-4 text-amber-400" />}
            accentColor="border-amber-500/10"
          >
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/[0.02] border border-emerald-500/10 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Active Scrapers (6)
                  </h4>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>YellowPages</span><span className="text-emerald-400/60 font-mono">US</span></div>
                    <div className="flex justify-between"><span>Superpages</span><span className="text-emerald-400/60 font-mono">US</span></div>
                    <div className="flex justify-between"><span>EZLocal</span><span className="text-emerald-400/60 font-mono">US</span></div>
                    <div className="flex justify-between"><span>Hotfrog</span><span className="text-emerald-400/60 font-mono">US</span></div>
                    <div className="flex justify-between"><span>Europages</span><span className="text-emerald-400/60 font-mono">INTL</span></div>
                    <div className="flex justify-between"><span>WLW</span><span className="text-emerald-400/60 font-mono">INTL</span></div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-red-500/10 rounded-lg p-4 md:col-span-2">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Blocked / Dead / Degraded (20)
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground/60">
                    <div className="flex justify-between"><span>MapQuest</span><span className="font-mono text-[10px]">requires-js</span></div>
                    <div className="flex justify-between"><span>n49</span><span className="font-mono text-[10px]">JS-rendered</span></div>
                    <div className="flex justify-between"><span>Yelp</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>BBB</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>Angi</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>Kompass</span><span className="font-mono text-[10px]">DataDome 403</span></div>
                    <div className="flex justify-between"><span>Yell</span><span className="font-mono text-[10px]">Cloudflare</span></div>
                    <div className="flex justify-between"><span>Cylex</span><span className="font-mono text-[10px]">Cloudflare</span></div>
                    <div className="flex justify-between"><span>Clutch</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>Manta</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>ChamberOfCommerce</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>TradeKey</span><span className="font-mono text-[10px]">410 dead</span></div>
                    <div className="flex justify-between"><span>ExportHub</span><span className="font-mono text-[10px]">404 dead</span></div>
                    <div className="flex justify-between"><span>Go4WorldBusiness</span><span className="font-mono text-[10px]">403</span></div>
                    <div className="flex justify-between"><span>TradeFord</span><span className="font-mono text-[10px]">Cloudflare</span></div>
                    <div className="flex justify-between"><span>TradeIndia</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>Made-in-China</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>IndiaMart</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>EC21</span><span className="font-mono text-[10px]">blocked</span></div>
                    <div className="flex justify-between"><span>GlobalSources</span><span className="font-mono text-[10px]">blocked</span></div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Taxonomy — Flowers vs. Pollen"
            icon={<Layers className="w-4 h-4 text-amber-400" />}
            accentColor="border-amber-500/10"
          >
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-amber-500/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Flower2 className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Flowers</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    Businesses with valid, commercial domain websites. These are prime leads — 
                    companies with established web presence that can be further enriched, allocated 
                    to portfolios, and targeted for Bumblebee submission.
                  </p>
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span>Must have a non-social, non-directory website URL</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span>Franchise brands are detected and flagged</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span>URLs normalized to bare domain for deduplication</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-amber-500/50 flex-shrink-0" />
                      <span>Beauty probe scores website accessibility (0–100)</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-yellow-500/10 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Radar className="w-4 h-4 text-yellow-400" />
                    <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Pollen</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                    Businesses without websites or identified as franchise operations. These represent 
                    secondary leads — franchise locations (known brands with local franchisees) and 
                    web-dark companies that may still have valid phone numbers.
                  </p>
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-yellow-500/50 flex-shrink-0" />
                      <span>No website or franchise-detected businesses</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-yellow-500/50 flex-shrink-0" />
                      <span>Franchise detection via 100+ brand word-boundary regex</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-yellow-500/50 flex-shrink-0" />
                      <span>Phone numbers can be routed to Carpenter Ants</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-2.5 h-2.5 mt-0.5 text-yellow-500/50 flex-shrink-0" />
                      <span>Linked back to originating crawl job for provenance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Anti-Detection & Stealth"
            icon={<Shield className="w-4 h-4 text-amber-400" />}
            accentColor="border-amber-500/10"
          >
            <div className="space-y-3 pt-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                The Ray of Grace employs multi-layered stealth to avoid bot detection and IP bans 
                from directory sites. Each request is crafted to appear as organic browser traffic.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <Eye className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                  <span><strong className="text-foreground">20 User-Agent Strings</strong> — Rotated randomly per request across Chrome, Firefox, Safari, Edge on Windows, Mac, Linux</span>
                </div>
                <div className="flex items-start gap-2">
                  <Eye className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                  <span><strong className="text-foreground">8 Accept-Language Headers</strong> — Regional locale variations (en-US, en-GB, en-CA, en-AU) with quality weights</span>
                </div>
                <div className="flex items-start gap-2">
                  <Eye className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                  <span><strong className="text-foreground">8 Referer Strings</strong> — Google, Bing, Yahoo search referers mixed with empty (direct navigation)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Eye className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                  <span><strong className="text-foreground">Randomized Cooldowns</strong> — 15.4–24.2s between requests with 26.4s enforced domain gap</span>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Seed Data — Categories & Locations"
            icon={<Target className="w-4 h-4 text-amber-400" />}
            accentColor="border-amber-500/10"
          >
            <div className="space-y-3 pt-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                The Hive is pre-loaded with a comprehensive seed database covering hundreds of business categories 
                organized into vertical bundles, paired with 500+ US city/state locations plus international locations 
                tagged for cross-border discovery.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  "Professional Services", "Construction", "Automotive", "Insurance",
                  "Final Expense", "Travel", "Trucking", "Healthcare",
                  "Technology", "Legal", "Finance", "Real Estate",
                  "Manufacturing", "Food & Beverage", "Education", "Retail"
                ].map((bundle) => (
                  <div key={bundle} className="bg-white/[0.02] border border-white/5 rounded px-2.5 py-1.5 text-[10px] text-center">
                    {bundle}
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 pt-2">
                <Globe className="w-3 h-3 mt-0.5 text-amber-500/50 flex-shrink-0" />
                <span>
                  International locations tagged <span className="font-mono text-foreground">intl</span> / <span className="font-mono text-foreground">travel</span> are 
                  routed exclusively to international-region scrapers (Europages, WLW). US locations go to US scrapers (YellowPages, Superpages, EZLocal, Hotfrog).
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Bug className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-bold text-foreground">II. Carpenter Ants — Phone Intelligence Pipeline</h2>
          </div>

          <CollapsibleSection
            title="The Colony — 399-Ant Architecture"
            icon={<Cpu className="w-4 h-4 text-red-400" />}
            defaultOpen={true}
            accentColor="border-red-500/10"
          >
            <div className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Carpenter Ants colony deploys 399 concurrent worker ants, each independently processing 
                a phone number through a 10-step verification pipeline. Multiple jobs can run simultaneously — 
                each job gets its own 399-ant pool, SSE progress stream, and stop control. The multi-job registry 
                uses a <span className="font-mono text-foreground">Map&lt;jobId, engine&gt;</span> pattern with auto-cleanup on completion.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Colony Parameters</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Ant Count</span><span className="text-foreground font-mono">399 per job</span></div>
                    <div className="flex justify-between"><span>Pipeline Steps</span><span className="text-foreground font-mono">10 sequential</span></div>
                    <div className="flex justify-between"><span>Intel Sources</span><span className="text-foreground font-mono">16 independent</span></div>
                    <div className="flex justify-between"><span>Max CSV Upload</span><span className="text-foreground font-mono">50,000 numbers</span></div>
                    <div className="flex justify-between"><span>Concurrent Jobs</span><span className="text-foreground font-mono">Unlimited</span></div>
                    <div className="flex justify-between"><span>Twilio Semaphore</span><span className="text-foreground font-mono">2 max global</span></div>
                    <div className="flex justify-between"><span>Source Timeout</span><span className="text-foreground font-mono">15 seconds</span></div>
                    <div className="flex justify-between"><span>Proxy Capacity</span><span className="text-foreground font-mono">Up to 399</span></div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Graceful Degradation</h4>
                  <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                      <span>Every source independently try/caught — a single API failure never crashes a pipeline run</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                      <span>Missing API keys produce <span className="font-mono text-foreground">available: false</span> — source excluded from verdict</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                      <span>Deterministic weighted-average verdict even when half the sources are unavailable</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                      <span>Proxy-miss falls back to direct connection (backward compatible)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="The 10-Step Pipeline"
            icon={<Workflow className="w-4 h-4 text-red-400" />}
            accentColor="border-red-500/10"
          >
            <div className="space-y-3 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Each phone number passes through 10 sequential steps. Steps 1–5 determine line type 
                (cell / landline / VoIP). Steps 6–10 determine activity status (active / inactive). 
                Each step queries one or more independent sources and accumulates evidence for the 
                final weighted verdict.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PipelineStep step={1} name="PARSE" sources={["libphonenumber"]} category="parse" />
                <PipelineStep step={2} name="LINE_TYPE_R1_TWILIO" sources={["Twilio Lookup"]} category="linetype" />
                <PipelineStep step={3} name="LINE_TYPE_R2_OFFLINE" sources={["FCC Blocks", "NPANXX", "libphonenumber"]} category="linetype" />
                <PipelineStep step={4} name="LINE_TYPE_R3_FREE_APIS" sources={["NumVerify", "AbstractAPI"]} category="linetype" />
                <PipelineStep step={5} name="LINE_TYPE_R4_PREMIUM" sources={["IPQS", "Veriphone"]} category="linetype" />
                <PipelineStep step={6} name="ACTIVE_R1_TWILIO_LIVE" sources={["Twilio Live Activity"]} category="active" />
                <PipelineStep step={7} name="ACTIVE_R2_CNAM_SIM" sources={["Twilio CNAM", "Twilio SIM Swap"]} category="active" />
                <PipelineStep step={8} name="ACTIVE_R3_WEB_CRM" sources={["Brave Search", "HubSpot CRM"]} category="active" />
                <PipelineStep step={9} name="ACTIVE_R4_INTERNAL" sources={["Phone Auth Heuristics", "DB Frequency"]} category="active" />
                <PipelineStep step={10} name="ACTIVE_R5_IPQS_DEEP" sources={["IPQS Active"]} category="deep" />
              </div>
              <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500/40" /> Parse</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500/40" /> Line Type</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500/40" /> Activity</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500/40" /> Deep Scan</div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Source Weights — Confidence-Weighted Voting"
            icon={<Brain className="w-4 h-4 text-red-400" />}
            accentColor="border-red-500/10"
          >
            <div className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each source carries a static weight reflecting its reliability. The final verdict is computed 
                by multiplying each source's weight by its reported confidence, then selecting the classification 
                with the highest cumulative score. Confidence is the winner's score divided by total weight.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-amber-500/10 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Line Type Weights</h4>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {[
                      { source: "Twilio Lookup", weight: "3.0" },
                      { source: "IPQS Line Type", weight: "2.0" },
                      { source: "NumVerify", weight: "1.5" },
                      { source: "AbstractAPI", weight: "1.5" },
                      { source: "Veriphone", weight: "1.5" },
                      { source: "libphonenumber", weight: "1.0" },
                      { source: "FCC Blocks", weight: "1.0" },
                      { source: "NPANXX", weight: "0.8" },
                    ].map(({ source, weight }) => (
                      <div key={source} className="flex justify-between">
                        <span>{source}</span>
                        <span className="font-mono text-amber-400/80">{weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-emerald-500/10 rounded-lg p-4">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Activity Weights</h4>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {[
                      { source: "Twilio Live Activity", weight: "3.0" },
                      { source: "IPQS Active", weight: "2.5" },
                      { source: "Twilio CNAM", weight: "2.0" },
                      { source: "Twilio SIM Swap", weight: "1.5" },
                      { source: "NumVerify", weight: "1.0" },
                      { source: "AbstractAPI", weight: "1.0" },
                      { source: "Veriphone", weight: "1.0" },
                      { source: "Brave Search", weight: "1.0" },
                      { source: "HubSpot", weight: "1.0" },
                      { source: "Phone Auth", weight: "0.8" },
                      { source: "DB Frequency", weight: "0.7" },
                    ].map(({ source, weight }) => (
                      <div key={source} className="flex justify-between">
                        <span>{source}</span>
                        <span className="font-mono text-emerald-400/80">{weight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="The 16 Intelligence Sources"
            icon={<Satellite className="w-4 h-4 text-red-400" />}
            accentColor="border-red-500/10"
          >
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-white/[0.02] border border-blue-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">Offline (3)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>libphonenumber — Google's phone parser</div>
                    <div>FCC Blocks — Wireless prefix allocations</div>
                    <div>NPANXX — Area code / state mapping</div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-cyan-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">Twilio (4 calls)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>Line Type Lookup — Primary classification</div>
                    <div>CNAM — Caller name registration</div>
                    <div>SIM Swap — Recent SIM change detection</div>
                    <div>Live Activity — Real-time reachability</div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-violet-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-violet-400 uppercase tracking-wider mb-2">Free APIs (2)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>NumVerify — Phone validation service</div>
                    <div>AbstractAPI — Phone intelligence</div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-amber-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Premium APIs (3)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>IPQS Line Type — Fraud score + type</div>
                    <div>IPQS Active — Deep activity probe</div>
                    <div>Veriphone — Global validation</div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-emerald-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">Web / CRM (2)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>Brave Search — Web presence scan</div>
                    <div>HubSpot CRM — Contact database match</div>
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-rose-500/10 rounded-lg p-3">
                  <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-2">Internal (2)</h4>
                  <div className="space-y-1 text-[10px] text-muted-foreground">
                    <div>Phone Auth Heuristics — Pattern analysis</div>
                    <div>DB Frequency — Cross-reference Hive data</div>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Geo-Proxy Pipeline — 399 Locations"
            icon={<Network className="w-4 h-4 text-red-400" />}
            accentColor="border-red-500/10"
          >
            <div className="space-y-3 pt-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                Each of the 399 ants can route external API calls through a dedicated proxy location. 
                Proxies are configured via the <span className="font-mono text-foreground">CARPENTER_PROXIES</span> environment 
                variable — a comma-separated list of up to 399 proxy URLs (SOCKS5, HTTP, or HTTPS).
              </p>
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2">Proxy Distribution</h4>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                    <span>Assignment: <span className="font-mono text-foreground">antIndex % proxyCount</span> — deterministic round-robin</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                    <span>Offline/internal sources (libphonenumber, FCC, NPANXX, heuristics, DB) bypass proxies</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                    <span>Supports SOCKS5 (<span className="font-mono text-foreground">socks5://host:port</span>), HTTP, and HTTPS agents</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ArrowRight className="w-3 h-3 mt-0.5 text-red-500/50 flex-shrink-0" />
                    <span>Zero proxies configured = direct calls, fully backward compatible</span>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Swords className="w-6 h-6 text-violet-400" />
            <h2 className="text-xl font-bold text-foreground">III. The Symbiosis</h2>
          </div>

          <div className="border border-violet-500/10 rounded-lg p-6 bg-white/[0.01]">
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                The Beauteous Brigade and Carpenter Ants are designed to operate as a symbiotic pair. 
                The Brigade discovers businesses and extracts phone numbers as a byproduct of its directory 
                crawling. Those phone numbers can then be fed directly into the Carpenter Ants' 10-step 
                pipeline for line type classification and activity verification.
              </p>

              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 my-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="text-center flex-1">
                    <Flower2 className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                    <div className="font-bold text-foreground">Hive Crawl</div>
                    <div className="text-[10px] text-muted-foreground">640 workers</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30" />
                  <div className="text-center flex-1">
                    <Database className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                    <div className="font-bold text-foreground">Flowers + Pollen</div>
                    <div className="text-[10px] text-muted-foreground">with phone numbers</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30" />
                  <div className="text-center flex-1">
                    <Bug className="w-5 h-5 text-red-400 mx-auto mb-1" />
                    <div className="font-bold text-foreground">Carpenter Ants</div>
                    <div className="text-[10px] text-muted-foreground">399 ants x 10 steps</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/30" />
                  <div className="text-center flex-1">
                    <Fingerprint className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                    <div className="font-bold text-foreground">Verified Intel</div>
                    <div className="text-[10px] text-muted-foreground">type + activity</div>
                  </div>
                </div>
              </div>

              <p>
                The <strong className="text-foreground">DB Frequency</strong> source in the Carpenter pipeline 
                directly cross-references phone numbers against the Hive's flowers and pollen tables via SQL, 
                creating a feedback loop: numbers that appear across multiple directory crawls score higher 
                activity confidence. This is the bridge between discovery and verification.
              </p>

              <p>
                Verified flowers with active phone numbers become prime candidates for Portfolio allocation, 
                full enrichment (SEC EDGAR + 11 deal source APIs), credit analysis, and ultimately Bumblebee 
                form submission — completing the intelligence cycle from raw directory listing to qualified 
                business lead.
              </p>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Boxes className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-foreground">IV. API Surface</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-amber-500/10 rounded-lg p-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Flower2 className="w-3 h-3" /> Hive Engine Routes
              </h4>
              <div className="space-y-1.5 text-[10px] text-muted-foreground font-mono">
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/crawl</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/crawl/:id/stop</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/crawl/status</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/crawl/:id/log</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/flowers</div>
                <div><span className="text-red-400/60">DELETE</span> /api/hive/flowers/:id</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/pollen</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/directories</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/categories</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/locations</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/stats</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/coverage</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/export</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/export-pollen</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/test-scraper</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/beauty-scan</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/beauty-scan/status</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/phone-scan</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/phone-scan/status</div>
                <div><span className="text-blue-400/60">GET</span>    /api/hive/completed-combos/count</div>
                <div><span className="text-red-400/60">DELETE</span> /api/hive/completed-combos</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/hive/health-check</div>
              </div>
            </div>
            <div className="bg-white/[0.02] border border-red-500/10 rounded-lg p-4">
              <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Bug className="w-3 h-3" /> Carpenter Ant Routes
              </h4>
              <div className="space-y-1.5 text-[10px] text-muted-foreground font-mono">
                <div><span className="text-emerald-400/60">POST</span>   /api/carpenter/jobs</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/jobs</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/jobs/:id</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/jobs/:id/results</div>
                <div><span className="text-red-400/60">DELETE</span> /api/carpenter/jobs/:id</div>
                <div><span className="text-emerald-400/60">POST</span>   /api/carpenter/jobs/:id/stop</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/progress</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/progress/stream</div>
                <div><span className="text-blue-400/60">GET</span>    /api/carpenter/sources</div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Antenna className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-foreground">V. Database Schema</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-amber-500/10 rounded-lg p-4">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Hive Tables</h4>
              <div className="space-y-2 text-[10px] text-muted-foreground font-mono">
                <div>
                  <span className="text-foreground">hive_directories</span>
                  <span className="text-muted-foreground/40 ml-2">— id, name, baseUrl, scraperKey, enabled, status, region</span>
                </div>
                <div>
                  <span className="text-foreground">hive_categories</span>
                  <span className="text-muted-foreground/40 ml-2">— id, name, slug, bundle, searchAliases[], isConsultingVariant</span>
                </div>
                <div>
                  <span className="text-foreground">hive_locations</span>
                  <span className="text-muted-foreground/40 ml-2">— id, city, state, slug, population, tag</span>
                </div>
                <div>
                  <span className="text-foreground">hive_flowers</span>
                  <span className="text-muted-foreground/40 ml-2">— id, name, website, normalizedUrl, phone, city, state, category, sourceDirectory, isFranchise, isAlive, beautyScore, beautyFlags</span>
                </div>
                <div>
                  <span className="text-foreground">hive_pollen</span>
                  <span className="text-muted-foreground/40 ml-2">— id, name, phone, city, state, category, sourceDirectory, crawlJobId</span>
                </div>
              </div>
            </div>
            <div className="bg-white/[0.02] border border-red-500/10 rounded-lg p-4">
              <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Carpenter Tables</h4>
              <div className="space-y-2 text-[10px] text-muted-foreground font-mono">
                <div>
                  <span className="text-foreground">carpenter_ant_jobs</span>
                  <span className="text-muted-foreground/40 ml-2">— id, status, total_numbers, completed, failed, source_filename, created_at, completed_at</span>
                </div>
                <div>
                  <span className="text-foreground">carpenter_ant_results</span>
                  <span className="text-muted-foreground/40 ml-2">— id, job_id (FK cascade), phone_raw, phone_normalized, country_code, carrier, step_results (JSONB), line_type_verdict, line_type_confidence, active_verdict, active_confidence, overall_status, current_step, error_message</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center py-8 space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Flower2 className="w-4 h-4 text-amber-400/40" />
            <span className="text-xs text-muted-foreground/30 font-mono tracking-widest">D.A.T.A. CLOUDWARE</span>
            <Bug className="w-4 h-4 text-red-400/40" />
          </div>
          <p className="text-[10px] text-muted-foreground/20">
            Beauteous Brigade v1.0 + Carpenter Ants v1.0
          </p>
        </div>
      </div>
    </div>
  );
}
