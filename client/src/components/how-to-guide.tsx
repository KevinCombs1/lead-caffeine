import { useRef } from "react";
import { motion } from "framer-motion";
import {
  X, GripHorizontal, Flower2, Radar, Search, Send, BarChart3, Radio,
  Sun, Zap, Rocket, PauseCircle, Copy, Pencil, ArrowRight,
  ShieldCheck, User, Mail, Phone, Building2, Briefcase,
  TreePine, Landmark, Sparkles, TrendingUp, DollarSign, XCircle, ChevronDown,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface HowToGuideProps {
  onClose: () => void;
}

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-400/10 align-middle mx-0.5 shrink-0">{children}</span>;
}

function Btn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/8 border border-amber-500/10 text-amber-200/60 text-[10px] font-medium align-middle mx-0.5 whitespace-nowrap">
      {icon}{label}
    </span>
  );
}

export function HowToGuide({ onClose }: HowToGuideProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[998]" />
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.95, x: 0, y: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed top-16 right-6 z-[999] w-[400px] max-h-[82vh] flex flex-col rounded-xl border border-amber-500/15 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/50"
        data-testid="panel-how-to-guide"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10 cursor-grab active:cursor-grabbing select-none shrink-0">
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-4 h-4 text-amber-400/30" />
            <span className="text-sm font-medium text-amber-200/70">How-To Guide</span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-amber-400/10 transition-colors"
            data-testid="button-close-guide"
          >
            <X className="w-3.5 h-3.5 text-amber-400/40" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-amber-500/8 shrink-0">
          <p className="text-[11px] text-amber-300/40 leading-relaxed">
            The Light Engine follows a natural workflow. You can jump to any step, but the recommended path is:
          </p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-400/30 font-medium">
            <span className="text-amber-300/50">Bloom</span> <ArrowRight className="w-2.5 h-2.5" />
            <span className="text-amber-300/50">X-Ray</span> <ArrowRight className="w-2.5 h-2.5" />
            <span className="text-amber-300/50">Forms</span> <ArrowRight className="w-2.5 h-2.5" />
            <span className="text-amber-300/50">Outreach</span> <ArrowRight className="w-2.5 h-2.5" />
            <span className="text-amber-300/50">Intel</span> <ArrowRight className="w-2.5 h-2.5" />
            <span className="text-amber-300/50">Manage</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-1 scrollbar-thin">
          <Accordion type="multiple" className="w-full">

            <AccordionItem value="step1" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                  <Flower2 className="w-3.5 h-3.5 text-amber-400/50" /> Bloom — Find Companies
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Bloom discovers companies from SEC EDGAR that may have unclaimed tax credits. Configure your search, then hit Bloom.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Controls:</p>
                  <p><strong className="text-amber-200/50">Industry dropdown</strong> — Searchable combobox with 475 sub-industries across 27 categories. Type to filter instantly.</p>
                  <p><strong className="text-amber-200/50">ST input</strong> — Optional 2-letter state code (e.g., CA, TX) to narrow geographically.</p>
                  <p><strong className="text-amber-200/50">Count input</strong> — Number of new companies to find. Default 10, max 500.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Source toggles:</p>
                  <p><Btn icon={<span className="text-[9px]">SIC</span>} label="SIC Industry" /> Searches SEC by industry classification codes. Results are pre-filtered against ~13k active public filers.</p>
                  <p><Btn icon={<span className="text-[9px]">D</span>} label="Form D" /> Searches recent Form D filings — companies actively raising capital.</p>
                  <p><Btn icon={<span className="text-[9px]">EFTS</span>} label="Filing Search" /> Full-text search of recent SEC filings. Use the query input to search for specific terms like "R&D tax credit".</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Switches:</p>
                  <p><strong className="text-amber-200/50">XBRL Gate</strong> — When ON, only keeps companies with structured financial data (needed for X-Ray). Turn OFF for broader discovery.</p>
                </div>

                <p><Btn icon={<Flower2 className="w-2.5 h-2.5" />} label="Bloom" /> Starts the discovery process. Progress streams in real-time.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step2" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                  <Radar className="w-3.5 h-3.5 text-amber-400/50" /> X-Ray — Analyze Financials
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Credit X-Ray scans a company's SEC filings using 76 XBRL tax concepts to uncover unclaimed credits.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Buttons:</p>
                  <p><Btn icon={<Radar className="w-2.5 h-2.5" />} label="Re-X-Ray" /> On each lead row — runs or refreshes the XBRL analysis for that company.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">What it produces:</p>
                  <p><strong className="text-amber-200/50">Credit Health Score</strong> (0-100) — How well the company uses available credits. Color-coded gauge: red = desert (0-20), orange = underexplored (21-40), yellow = partial (41-60), green = well-managed (61-80), blue = fully optimized (81-100).</p>
                  <p><strong className="text-amber-200/50">Estimated Unclaimed Value</strong> — Dollar amount of credits they're likely leaving on the table.</p>
                  <p><strong className="text-amber-200/50">Tax Position Summary</strong> — Effective rate vs. statutory rate, NOL carryforwards, R&D intensity.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Badges:</p>
                  <p><strong className="text-amber-200/50">"Living"</strong> — Lead has been x-rayed and has XBRL data.</p>
                  <p><strong className="text-amber-200/50">"Dormant"</strong> — Lead has no XBRL data yet (needs x-ray or doesn't file structured data).</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step3" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                  <Search className="w-3.5 h-3.5 text-amber-400/50" /> Forms — Find Contact Points
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Crawls a company's website to find contact forms, demo pages, and other submission endpoints.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">What it finds:</p>
                  <p><strong className="text-amber-200/50">Form count badges</strong> — Shown on each lead card. More forms = more outreach options.</p>
                  <p><strong className="text-amber-200/50">Form classifications</strong> — Labels like Contact, Investor, Demo, Support, Newsletter.</p>
                  <p><strong className="text-amber-200/50">Field inventory</strong> — Lists every input field (name, email, phone, message, etc.) and hidden fields.</p>
                </div>

                <p>Expand any lead card to see all discovered forms with their URLs, methods, and field details.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step4" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
                  <Send className="w-3.5 h-3.5 text-amber-400/50" /> Outreach — Send Messages
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Submit gentle outreach messages through discovered contact forms. Always starts in safe mode.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Sender Profile (set these first):</p>
                  <p><Ic><User className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Name</strong> — Your full name.</p>
                  <p><Ic><Mail className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Email</strong> — Reply-to email address.</p>
                  <p><Ic><Phone className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Phone</strong> — Contact number.</p>
                  <p><Ic><Building2 className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Company</strong> — Your company name.</p>
                  <p><Ic><Briefcase className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Title</strong> — Your role/title.</p>
                  <p className="text-amber-400/25 text-[10px]">These persist in your browser and auto-fill form fields.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Batch controls:</p>
                  <p><strong className="text-amber-200/50">Dry Run switch</strong> — ON by default. Simulates submissions without sending. Toggle OFF to go live.</p>
                  <p><Btn icon={<Rocket className="w-2.5 h-2.5" />} label="Submit All" /> Sends to all leads with forms (or dry-runs them).</p>
                  <p><Btn icon={<PauseCircle className="w-2.5 h-2.5" />} label="Stop" /> Aborts a batch mid-run.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Per-form buttons (inside expanded lead):</p>
                  <p><Ic><Copy className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Copy URL</strong> — Copies the form's action URL to clipboard.</p>
                  <p><Ic><Pencil className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Compose</strong> — Opens a dialog to customize field values before sending.</p>
                  <p><Ic><Rocket className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Send Single</strong> — Submits just this one form.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Other actions:</p>
                  <p><Btn icon={<Zap className="w-2.5 h-2.5" />} label="Quantum Forward" /> Saves a summary of all forms for a lead as one outreach record.</p>
                  <p><Ic><ArrowRight className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Advance</strong> — Moves pipeline stage: Composed → Pushed → Exchanged → Received.</p>
                  <p><Ic><ShieldCheck className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Defense Check</strong> — Scans a domain for WAF, honeypots, and bot detection before you approach.</p>
                  <p><strong className="text-amber-200/50">Graceful Skip</strong> — The system automatically detects honeypots and bot defenses before submitting. If defenses are found, the form is skipped with a toast notification.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step5" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">5</span>
                  <BarChart3 className="w-3.5 h-3.5 text-amber-400/50" /> Intel — Analyze Your Pipeline
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>The Quantum Intel Dashboard shows aggregate analytics across all your leads.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Opening it:</p>
                  <p><Btn icon={<BarChart3 className="w-2.5 h-2.5" />} label="Dashboard" /> Toggle button with <Ic><ChevronDown className="w-2.5 h-2.5 text-amber-400/50" /></Ic> — expands or collapses the entire intel panel.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">What's inside:</p>
                  <p><strong className="text-amber-200/50">Unclaimed Value</strong> — Big hero number showing total estimated credits your leads are missing.</p>
                  <p><strong className="text-amber-200/50">Financial Dimensions</strong> — Revenue Pool, R&D Spend, Employee count, NOL Pool summaries.</p>
                  <p><Ic><Sparkles className="w-2.5 h-2.5 text-amber-400/50" /></Ic><Ic><TrendingUp className="w-2.5 h-2.5 text-amber-400/50" /></Ic><Ic><DollarSign className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Priority Vectors</strong> — Click to filter leads by high-value segments (e.g., "High R&D, zero credits").</p>
                  <p><strong className="text-amber-200/50">Top Leads</strong> — Shortcut buttons that jump to specific high-value companies.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Intelligence Tabs:</p>
                  <p><strong className="text-amber-200/50">Overview</strong> — Credit Health tiers, Tax Rate tiers, Revenue tiers. Click any bar to filter the table.</p>
                  <p><strong className="text-amber-200/50">Clusters</strong> — Groups leads by opportunity patterns.</p>
                  <p><strong className="text-amber-200/50">Legislative</strong> — Shows geographic and statutory impacts on credits.</p>
                  <p><strong className="text-amber-200/50">Cross-Ref</strong> — Cross-references leads across multiple dimensions.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Filters:</p>
                  <p><strong className="text-amber-200/50">Active filter badges</strong> — Appear when filters are applied. Click <Ic><XCircle className="w-2.5 h-2.5 text-amber-400/50" /></Ic> on any badge to remove it.</p>
                  <p><strong className="text-amber-200/50">Clear All</strong> — Resets every active filter at once.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step6" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-400/10 text-amber-300/60 text-[10px] font-bold flex items-center justify-center shrink-0">6</span>
                  <Radio className="w-3.5 h-3.5 text-amber-400/50" /> Table — Sort, Filter & Manage
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>The main lead list. Every company you've bloomed appears here.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Filtering:</p>
                  <p><Ic><Search className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Search</strong> — Type to filter by company name or domain.</p>
                  <p><Ic><TreePine className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Industry Category</strong> — Dropdown to filter by sector.</p>
                  <p><strong className="text-amber-200/50">Sub-Industry</strong> — Narrows further within a selected category.</p>
                  <p><Ic><Landmark className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Min Credit ($K)</strong> — Only show leads above a credit value threshold.</p>
                  <p><strong className="text-amber-200/50">Hide Dormant</strong> — Toggle to hide leads without XBRL data.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Sort buttons:</p>
                  <p><strong className="text-amber-200/50">Forms</strong> — By discovered form count.</p>
                  <p><strong className="text-amber-200/50">Ads</strong> — By ad network count.</p>
                  <p><strong className="text-amber-200/50">Credits</strong> — By applicable credit count.</p>
                  <p><strong className="text-amber-200/50">Health</strong> — By Credit Health Score.</p>
                  <p><strong className="text-amber-200/50">Unclaimed</strong> — By estimated unclaimed value.</p>
                  <p><strong className="text-amber-200/50">Name</strong> — Alphabetical by company name.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Lead cards:</p>
                  <p><strong className="text-amber-200/50">Click to expand</strong> — Opens full details: tax position, credit analysis, discovered forms, outreach history.</p>
                  <p><strong className="text-amber-200/50">Pipeline badges</strong> — Show outreach stage: Composed → Pushed → Exchanged → Received.</p>
                  <p><strong className="text-amber-200/50">Source badges</strong> — Show where the lead came from (SIC, Form D, EFTS).</p>
                  <p><Ic><Sun className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Refresh</strong> — Reloads all lead data from the server.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>

        <div className="px-4 py-2 border-t border-amber-500/8 shrink-0">
          <p className="text-[10px] text-amber-400/20 text-center">Drag the header to reposition this guide</p>
        </div>
      </motion.div>
    </>
  );
}
