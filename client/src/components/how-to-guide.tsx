import { useRef } from "react";
import { motion } from "framer-motion";
import {
  X, GripHorizontal, Flower2, Send, ArrowRight,
  Sun, Zap, Rocket, PauseCircle, Copy, Pencil,
  ShieldCheck, User, Mail, Phone, Building2, Briefcase,
  TreePine, Landmark, Search, Leaf,
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
            The Light Engine has two jobs: find companies, then reach out to them.
          </p>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-medium">
            <span className="px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300/60 border border-cyan-400/10">Discovery</span>
            <ArrowRight className="w-3 h-3 text-amber-400/20" />
            <span className="px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300/60 border border-amber-400/10">Bloom</span>
          </div>
          <p className="text-[10px] text-amber-400/20 mt-1.5">All scanning, X-Ray, credit analysis, gap matrix, and intelligence enrichment are Phase 2: Credit Scanner.</p>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-1 scrollbar-thin">
          <Accordion type="multiple" className="w-full">

            <div className="pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/40">Part 1 — Company Discovery</p>
            </div>

            <AccordionItem value="discovery-search" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <Flower2 className="w-3.5 h-3.5 text-cyan-400/50" /> Search Controls
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Configure how you want to find companies, then hit the discovery button to pull them from SEC EDGAR.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Inputs:</p>
                  <p><strong className="text-amber-200/50">Industry dropdown</strong> — Searchable combobox with 475 sub-industries across 27 categories. Type to filter instantly.</p>
                  <p><strong className="text-amber-200/50">ST input</strong> — Optional 2-letter state code (e.g., CA, TX) to narrow geographically.</p>
                  <p><strong className="text-amber-200/50">Count input</strong> — How many companies to find. Default 10. Quick buttons for 100, 250, 500.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Source toggles (pick one or more):</p>
                  <p><Btn icon={<span className="text-[9px]">SIC</span>} label="SIC Industry" /> Searches by industry classification codes. Pre-filtered against ~13k active public filers to avoid dead companies.</p>
                  <p><Btn icon={<span className="text-[9px]">D</span>} label="Form D" /> Searches recent Form D filings — companies actively raising capital.</p>
                  <p><Btn icon={<span className="text-[9px]">EFTS</span>} label="Filing Search" /> Full-text search of recent SEC filings. Pair with the query input below.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Options:</p>
                  <p><strong className="text-amber-200/50">XBRL Gate</strong> — When ON, only keeps companies with structured financial data. Turn OFF for broader discovery.</p>
                  <p><strong className="text-amber-200/50">EFTS Query</strong> — Appears when Filing Search is active. Enter search terms like "R&D tax credit" or "net operating loss".</p>
                </div>

                <p><Btn icon={<Flower2 className="w-2.5 h-2.5" />} label="Bloom" /> Starts the discovery process. Progress streams in real-time as companies are found and filtered.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="discovery-table" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-cyan-400/50" /> Table Filtering & Sorting
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Once you've discovered companies, use the table controls to find the ones you want to target.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Filters:</p>
                  <p><Ic><Search className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Search</strong> — Type to filter by company name or domain.</p>
                  <p><Ic><TreePine className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Industry Category</strong> — Dropdown to filter by sector.</p>
                  <p><strong className="text-amber-200/50">Sub-Industry</strong> — Narrows further within a selected category.</p>
                  <p><Ic><Landmark className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Min Credit ($K)</strong> — Only show leads above a credit value threshold.</p>
                  <p><strong className="text-amber-200/50">Hide Dormant</strong> — Toggle to hide leads without XBRL data.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Sort buttons:</p>
                  <p><strong className="text-amber-200/50">Forms</strong> — By discovered form count. <strong className="text-amber-200/50">Ads</strong> — By ad network count. <strong className="text-amber-200/50">Credits</strong> — By applicable credit count.</p>
                  <p><strong className="text-amber-200/50">Health</strong> — By Credit Health Score. <strong className="text-amber-200/50">Unclaimed</strong> — By estimated unclaimed value. <strong className="text-amber-200/50">Name</strong> — Alphabetical.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Lead cards:</p>
                  <p><strong className="text-amber-200/50">Click to expand</strong> — Opens full details: company info, discovered forms, outreach history.</p>
                  <p><strong className="text-amber-200/50">Source badges</strong> — Show where the lead came from (SIC, Form D, EFTS).</p>
                  <p><Ic><Sun className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Refresh</strong> — Reloads all lead data from the server.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <div className="pt-4 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/40">Part 2 — Bloom Engine</p>
            </div>

            <AccordionItem value="bloom-profile" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-amber-400/50" /> Sender Profile
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Set your identity before sending any outreach. These fields auto-fill discovered contact forms.</p>

                <div className="space-y-1.5">
                  <p><Ic><User className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Name</strong> — Your full name.</p>
                  <p><Ic><Mail className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Email</strong> — Reply-to email address.</p>
                  <p><Ic><Phone className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Phone</strong> — Contact number.</p>
                  <p><Ic><Building2 className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Company</strong> — Your company name.</p>
                  <p><Ic><Briefcase className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Title</strong> — Your role or title.</p>
                </div>

                <p className="text-amber-400/25 text-[10px]">Persists in your browser — you only need to set this once.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bloom-batch" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-amber-400/50" /> Batch Submission
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Send outreach to all your leads at once, or safely simulate everything first.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Controls:</p>
                  <p><strong className="text-amber-200/50">Dry Run switch</strong> — ON by default. Simulates every submission without actually sending anything. Toggle OFF to go live.</p>
                  <p><Btn icon={<Rocket className="w-2.5 h-2.5" />} label="Submit All" /> Sends to all leads with discovered forms (or dry-runs them). Label changes to "Dry Run — All Leads" in safe mode.</p>
                  <p><Btn icon={<PauseCircle className="w-2.5 h-2.5" />} label="Stop" /> Aborts a batch mid-run.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Submit log:</p>
                  <p>A real-time feed appears during submission showing each form's result. <Ic><Leaf className="w-2.5 h-2.5 text-lime-400/50" /></Ic> Lime entries are graceful skips — the bees backed away from defenses.</p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bloom-per-form" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <Pencil className="w-3.5 h-3.5 text-amber-400/50" /> Per-Form Actions
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Inside each expanded lead card, every discovered form has its own set of controls.</p>

                <div className="space-y-1.5">
                  <p><Ic><Copy className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Copy URL</strong> — Copies the form's action URL to clipboard.</p>
                  <p><Ic><Pencil className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Compose</strong> — Opens a dialog to customize each field value before sending. Use this to write a personalized message.</p>
                  <p><strong className="text-amber-200/50">Auto-Fill</strong> — Pre-populates form fields from your sender profile with one click.</p>
                  <p><Ic><Rocket className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Send Single</strong> — Submits just this one form (respects the Dry Run switch).</p>
                </div>

                <p><Btn icon={<Zap className="w-2.5 h-2.5" />} label="Quantum Forward" /> Appears when a lead has multiple forms. Saves a summary of all discovered forms as one outreach record.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bloom-pipeline" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400/50" /> Pipeline & Safety
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2.5">
                <p>Track where each lead stands in your outreach, and how the bees stay safe.</p>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Pipeline stages:</p>
                  <p><Ic><ArrowRight className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Advance</strong> — Click to move a lead through: <strong className="text-amber-200/50">Composed</strong> → <strong className="text-amber-200/50">Pushed</strong> → <strong className="text-amber-200/50">Exchanged</strong> → <strong className="text-amber-200/50">Received</strong>.</p>
                  <p><strong className="text-amber-200/50">Pipeline badges</strong> — Color-coded badges on each lead card show the current outreach stage at a glance.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-amber-200/50 font-medium">Safety mechanisms:</p>
                  <p><Ic><ShieldCheck className="w-2.5 h-2.5 text-amber-400/50" /></Ic> <strong className="text-amber-200/50">Defense Check</strong> — Click the shield icon on any lead to scan their domain for WAF, honeypots, bot detection scripts, and JS challenges before you approach.</p>
                  <p><Ic><Leaf className="w-2.5 h-2.5 text-lime-400/50" /></Ic> <strong className="text-amber-200/50">Graceful Skip</strong> — During submission, if the bees detect defenses, they back away quietly. The form is skipped and you get a notification. No alarms triggered, no blocks earned.</p>
                  <p className="text-amber-400/25 text-[10px]">The bees are precocious, elegant, and gentle. They give grace.</p>
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
