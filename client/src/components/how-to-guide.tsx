import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { X, GripHorizontal, Flower2, Radar, Shield, Send, BarChart3, Search, Radio, Zap } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface HowToGuideProps {
  onClose: () => void;
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
        className="fixed top-16 right-6 z-[999] w-[380px] max-h-[80vh] flex flex-col rounded-xl border border-amber-500/15 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/50"
        data-testid="panel-how-to-guide"
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-amber-500/10 cursor-grab active:cursor-grabbing select-none shrink-0"
        >
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

        <div className="overflow-y-auto flex-1 px-4 py-2 scrollbar-thin">
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="bloom" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Flower2 className="w-3.5 h-3.5 text-amber-400/50" /> Bloom Discovery</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Bloom finds companies with potential unclaimed tax credits by searching SEC EDGAR.</p>
                <p><strong className="text-amber-200/50">Industry</strong> — Select a sub-industry from the searchable dropdown. Type to filter across 475 options.</p>
                <p><strong className="text-amber-200/50">State</strong> — Optional 2-letter state code to narrow results geographically.</p>
                <p><strong className="text-amber-200/50">Count</strong> — How many new leads to discover (default 10).</p>
                <p><strong className="text-amber-200/50">Source toggles</strong> — Control where Bloom looks:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong className="text-amber-200/50">SIC</strong> — Searches by industry classification codes. Pre-filtered against active public filers.</li>
                  <li><strong className="text-amber-200/50">D</strong> — Searches Form D filings (companies raising capital).</li>
                  <li><strong className="text-amber-200/50">EFTS</strong> — Full-text search of recent SEC filings. Pair with a search query for best results.</li>
                </ul>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="xbrl" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400/50" /> XBRL Gate</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>When enabled, Bloom only keeps companies that have structured XBRL financial data in their SEC filings.</p>
                <p>This means you get companies with rich financial detail (revenue, R&D spend, tax positions) that can be analyzed by Credit X-Ray.</p>
                <p><strong className="text-amber-200/50">Toggle off</strong> if you want broader discovery and don't need deep financial analysis right away.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="xray" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Radar className="w-3.5 h-3.5 text-amber-400/50" /> Re-X-Ray (Credit X-Ray)</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Performs deep financial analysis on a company's SEC filings using 76 XBRL tax concepts.</p>
                <p>Produces a <strong className="text-amber-200/50">Credit Health Score</strong> (0-100) showing how well a company utilizes available credits, plus an <strong className="text-amber-200/50">estimated unclaimed value</strong>.</p>
                <p>Click the Re-X-Ray button on any lead row to run or refresh the analysis. Leads change from "dormant" to "living" once x-rayed.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="forms" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Search className="w-3.5 h-3.5 text-amber-400/50" /> Form Discovery</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Crawls a company's website to find contact forms, demo request pages, and other submission points.</p>
                <p>Identifies field types, hidden fields, and classifies each form (Contact, Investor, Support, etc.).</p>
                <p>Forms found here become targets for the Form Submitter outreach step.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="submitter" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Send className="w-3.5 h-3.5 text-amber-400/50" /> Form Submitter (Bumblebee)</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Sends gentle, human-timed outreach messages through discovered contact forms.</p>
                <p><strong className="text-amber-200/50">Dry Run</strong> — Default mode. Simulates submission without actually sending anything. Toggle off to go live.</p>
                <p><strong className="text-amber-200/50">Sender Profile</strong> — Set your name, email, phone, and title. These auto-fill form fields during submission.</p>
                <p><strong className="text-amber-200/50">Grace Check</strong> — Automatically scans for honeypots, WAF protection, and bot detection before submitting.</p>
                <p>Use the manual composer (pencil icon) on individual leads to customize the message per company.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="intel" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-amber-400/50" /> Quantum Intel Dashboard</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Aggregate analytics across all your leads. Toggle it open with the dashboard button.</p>
                <p><strong className="text-amber-200/50">Unclaimed Value</strong> — Total estimated tax credits your leads are leaving on the table.</p>
                <p><strong className="text-amber-200/50">Priority Vectors</strong> — Quick filters for high-value segments (e.g., "High R&D, zero credits").</p>
                <p><strong className="text-amber-200/50">Tiers</strong> — Click Credit Health, Tax Rate, or Revenue tiers to filter the data table below.</p>
                <p><strong className="text-amber-200/50">Tabs</strong> — Switch between Overview, Clusters, Legislative impact, and Cross-Ref views.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="table" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Radio className="w-3.5 h-3.5 text-amber-400/50" /> Data Table & Filtering</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>The main lead list. Each row shows company name, domain, forms found, ad networks, and credit health.</p>
                <p><strong className="text-amber-200/50">Search</strong> — Filter by company name or domain.</p>
                <p><strong className="text-amber-200/50">Sort</strong> — Order by form count, ad networks, credit health, or unclaimed value.</p>
                <p><strong className="text-amber-200/50">Pipeline stages</strong> — Track each lead through Composed, Pushed, and Received phases.</p>
                <p><strong className="text-amber-200/50">Expand a row</strong> — See full tax position summary, credit analysis, and discovered forms with metadata.</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ads" className="border-amber-500/8">
              <AccordionTrigger className="py-3 text-xs font-medium text-amber-200/60 hover:no-underline hover:text-amber-200/80">
                <span className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-400/50" /> Ad Intelligence</span>
              </AccordionTrigger>
              <AccordionContent className="text-[11px] text-amber-300/40 leading-relaxed space-y-2">
                <p>Shows which advertising networks and tracking pixels a company has active on their website.</p>
                <p>Companies with active ad spend (Google Ads, Facebook, LinkedIn, etc.) are generally more receptive to outreach and more likely to be actively growing.</p>
                <p>Pixel data (analytics, retargeting) indicates marketing sophistication.</p>
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
