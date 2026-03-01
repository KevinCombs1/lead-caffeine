import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Lock, Pencil, Send } from "lucide-react";
import type { LeadDelta, DiscoveredForm } from "./types";
import { FORM_LABELS } from "./types";

interface ComposeDialogProps {
  composeForm: { lead: LeadDelta; form: DiscoveredForm } | null;
  composeFields: Record<string, string>;
  setComposeFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setComposeForm: (val: null) => void;
  saveCompose: () => void;
}

export function ComposeDialog({ composeForm, composeFields, setComposeFields, setComposeForm, saveCompose }: ComposeDialogProps) {
  return (
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
  );
}
