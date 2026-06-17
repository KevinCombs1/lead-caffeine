import { storage } from "./storage";
import type { EmailCampaign, EmailRecipient, EmailProviderConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

import nodemailer from "nodemailer";

interface SmtpProvider {
  name: string;
  displayName: string;
  transporter: any;
  dailyLimit: number;
  sentToday: number;
  suspended: boolean;
  lastSend: number;
}

class EmailEngine {
  private providers: SmtpProvider[] = [];
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private campaignId: number | null = null;

  constructor() {
    this.loadProviders();
  }

  async loadProviders(): Promise<void> {
    const configs = await storage.getEmailProviderConfigs();
    this.providers = configs
      .filter(c => c.isActive)
      .map(c => ({
        name: c.name,
        displayName: c.displayName,
        transporter: nodemailer
          ? nodemailer.createTransport({
              host: c.host,
              port: c.port,
              secure: c.secure,
              auth: { user: c.authUser, pass: c.authPassword },
              tls: { rejectUnauthorized: false },
            })
          : null,
        dailyLimit: c.dailyLimit,
        sentToday: 0,
        suspended: false,
        lastSend: 0,
      }));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log("[email-engine] Starting email drip queue...");
    await this.processNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[email-engine] Stopped.");
  }

  private async processNext(): Promise<void> {
    if (!this.running) return;

    try {
      // Get active campaign
      const campaigns = await storage.getEmailCampaigns();
      const active = campaigns.find(c => c.status === "sending");
      if (!active) {
        this.timer = setTimeout(() => this.processNext(), 30000);
        return;
      }

      // Get queued recipients
      const recipients = await storage.getEmailRecipientsByStatus("queued", 10);
      if (recipients.length === 0) {
        // All done for this campaign
        const stats = await storage.getEmailRecipientStats(active.id);
        const total = stats.reduce((s, r) => s + r.count, 0);
        const sent = stats.find(s => s.status === "sent")?.count || 0;
        const bounced = stats.find(s => s.status === "bounced")?.count || 0;
        await storage.updateEmailCampaign(active.id, {
          status: sent + bounced >= total ? "sent" : "paused",
          sentCount: sent,
          bouncedCount: bounced,
        });
        this.timer = setTimeout(() => this.processNext(), 30000);
        return;
      }

      // Find best provider
      const provider = this.selectProvider();
      if (!provider) {
        console.log("[email-engine] All providers at limit or suspended. Pausing 5 min.");
        this.timer = setTimeout(() => this.processNext(), 300000);
        return;
      }

      // Send one email
      const recipient = recipients[0];
      const result = await this.sendEmail(provider, active, recipient);

      if (result.success) {
        await storage.updateEmailRecipient(recipient.id, {
          status: "sent",
          provider: provider.name,
          sentAt: new Date(),
        });
        provider.sentToday++;
        provider.lastSend = Date.now();
        const updatedStats = await storage.getEmailRecipientStats(active.id);
        const updatedSent = updatedStats.find(s => s.status === "sent")?.count || 0;
        await storage.updateEmailCampaign(active.id, { sentCount: updatedSent });
      } else {
        await storage.updateEmailRecipient(recipient.id, {
          status: result.retryable ? "queued" : "bounced",
          error: result.error,
        });
        if (result.error?.includes("limit") || result.error?.includes("quota") || result.error?.includes("429")) {
          provider.suspended = true;
        }
      }

      // Drip speed: delay based on campaign dripSpeed (seconds between emails)
      const delay = (active.dripSpeed || 60) * 1000;
      this.timer = setTimeout(() => this.processNext(), delay);

    } catch (err: any) {
      console.error("[email-engine] Error:", err.message);
      this.timer = setTimeout(() => this.processNext(), 60000);
    }
  }

  private selectProvider(): SmtpProvider | null {
    const now = Date.now();
    const available = this.providers.filter(p => {
      if (!p.transporter) return false;
      if (!this.isProviderHealthy(p)) return false;
      if (p.suspended) return false;
      if (p.sentToday >= p.dailyLimit) return false;
      // Enforce min gap: 2 seconds between sends per provider
      if (now - p.lastSend < 2000) return false;
      return true;
    });

    if (available.length === 0) return null;
    // Pick provider with most remaining capacity
    return available.reduce((best, current) => {
      const bestRemaining = (best.dailyLimit - best.sentToday) / best.dailyLimit;
      const currentRemaining = (current.dailyLimit - current.sentToday) / current.dailyLimit;
      return currentRemaining > bestRemaining ? current : best;
    });
  }

  private isProviderHealthy(provider: SmtpProvider): boolean {
    try {
      const transporter = provider.transporter;
      const user = transporter?.options?.auth?.user;
      const pass = transporter?.options?.auth?.pass;
      return !!user && !!pass && user.length > 0;
    } catch {
      return false;
    }
  }

  private async sendEmail(
    provider: SmtpProvider,
    campaign: EmailCampaign,
    recipient: EmailRecipient
  ): Promise<{ success: boolean; error?: string; retryable?: boolean }> {
    if (!provider.transporter) {
      return { success: false, error: "nodemailer not installed", retryable: false };
    }

    const subject = this.renderTemplate(campaign.subject, recipient);
    const html = this.renderTemplate(campaign.body, recipient);
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    try {
      const info = await provider.transporter.sendMail({
        from: `"${campaign.senderName || "D.A.T.A. Cloudware"}" <${provider.transporter.options.auth.user}>`,
        to: recipient.email,
        subject,
        html,
        text,
      });
      return { success: true };
    } catch (err: any) {
      const errorMsg = err.message || "Unknown error";
      const retryable = err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "429";
      return { success: false, error: errorMsg, retryable };
    }
  }

  private renderTemplate(template: string, recipient: EmailRecipient): string {
    let result = template;
    result = result.replace(/\{\{firstName\}\}/g, recipient.firstName || "Friend");
    result = result.replace(/\{\{lastName\}\}/g, recipient.lastName || "");
    result = result.replace(/\{\{company\}\}/g, recipient.company || "your company");
    result = result.replace(/\{\{email\}\}/g, recipient.email);
    if (recipient.variables) {
      const vars = recipient.variables as Record<string, string>;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
      }
    }
    return result;
  }

  async seedDefaultProviders(): Promise<void> {
    const existing = await storage.getEmailProviderConfigs();
    if (existing.length > 0) return;

    const defaults = [
      { name: "gmail", displayName: "Gmail", host: "smtp.gmail.com", port: 587, secure: false, authUser: "", authPassword: "", dailyLimit: 500 },
      { name: "outlook", displayName: "Outlook", host: "smtp-mail.outlook.com", port: 587, secure: false, authUser: "", authPassword: "", dailyLimit: 300 },
      { name: "yahoo", displayName: "Yahoo", host: "smtp.mail.yahoo.com", port: 587, secure: false, authUser: "", authPassword: "", dailyLimit: 500 },
    ];

    for (const config of defaults) {
      await storage.createEmailProviderConfig(config as any);
    }
    console.log("[email-engine] Seeded default provider configs.");
  }
}

let engine: EmailEngine | null = null;

export function getEmailEngine(): EmailEngine {
  if (!engine) {
    engine = new EmailEngine();
  }
  return engine;
}

export async function startEmailQueue(): Promise<void> {
  const eng = getEmailEngine();
  await eng.seedDefaultProviders();
  await eng.start();
}

export function stopEmailQueue(): void {
  if (engine) {
    engine.stop();
    engine = null;
  }
}
