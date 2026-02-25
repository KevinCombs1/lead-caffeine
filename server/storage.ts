import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  users, type User, type InsertUser,
  scrapeJobs, type ScrapeJob, type InsertScrapeJob,
  scrapedResults, type ScrapedResult, type InsertScrapedResult,
  discoveredPaths, type DiscoveredPath, type InsertDiscoveredPath,
  domainIntel, type DomainIntel, type InsertDomainIntel,
  scanConfigs, type ScanConfig, type InsertScanConfig,
  discoveryGraphs, type DiscoveryGraph, type InsertDiscoveryGraph,
  fiscalIntel, type FiscalIntel, type InsertFiscalIntel,
  fiscalLeads, type FiscalLead, type InsertFiscalLead,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createJob(job: InsertScrapeJob): Promise<ScrapeJob>;
  getJob(id: string): Promise<ScrapeJob | undefined>;
  getJobs(status?: string): Promise<ScrapeJob[]>;
  updateJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined>;
  deleteJob(id: string): Promise<void>;

  createResult(result: InsertScrapedResult): Promise<ScrapedResult>;
  createResultsBatch(results: InsertScrapedResult[]): Promise<void>;
  getResults(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }, limit?: number, offset?: number): Promise<ScrapedResult[]>;
  getResultsCount(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }): Promise<number>;
  getResultCount(jobId: string): Promise<number>;
  deleteResultsByJob(jobId: string): Promise<void>;

  createPath(path: InsertDiscoveredPath): Promise<DiscoveredPath>;
  createPathsBatch(paths: InsertDiscoveredPath[]): Promise<void>;
  getPaths(filters?: { jobId?: string; domain?: string; statusCode?: number }, limit?: number, offset?: number): Promise<DiscoveredPath[]>;
  getPathsCount(filters?: { jobId?: string; domain?: string; statusCode?: number }): Promise<number>;
  getPathCount(jobId: string): Promise<number>;
  deletePathsByJob(jobId: string): Promise<void>;

  getDomainIntel(domain: string): Promise<DomainIntel | undefined>;
  upsertDomainIntel(intel: InsertDomainIntel): Promise<DomainIntel>;

  createConfig(config: InsertScanConfig): Promise<ScanConfig>;
  getConfigs(): Promise<ScanConfig[]>;
  deleteConfig(id: string): Promise<void>;

  saveGraph(graph: InsertDiscoveryGraph): Promise<DiscoveryGraph>;
  getGraphByJob(jobId: string): Promise<DiscoveryGraph | undefined>;
  getGraphByDomain(domain: string): Promise<DiscoveryGraph | undefined>;
  getGraphs(): Promise<DiscoveryGraph[]>;
  deleteGraphByJob(jobId: string): Promise<void>;

  createFiscalIntel(item: InsertFiscalIntel): Promise<FiscalIntel>;
  createFiscalIntelBatch(items: InsertFiscalIntel[]): Promise<void>;
  getFiscalIntel(company: string, filters?: { source?: string; category?: string }): Promise<FiscalIntel[]>;
  getFiscalIntelByDomain(domain: string): Promise<FiscalIntel[]>;
  getFiscalIntelCached(company: string, source: string): Promise<FiscalIntel | undefined>;
  deleteFiscalIntel(company: string, source?: string): Promise<void>;

  createFiscalLead(lead: InsertFiscalLead): Promise<FiscalLead>;
  getFiscalLead(id: string): Promise<FiscalLead | undefined>;
  getFiscalLeadByCompany(company: string): Promise<FiscalLead | undefined>;
  getFiscalLeads(filters?: { opportunityLevel?: string; pipelineStage?: string }, limit?: number, offset?: number): Promise<FiscalLead[]>;
  getFiscalLeadsCount(filters?: { opportunityLevel?: string; pipelineStage?: string }): Promise<number>;
  updateFiscalLead(id: string, updates: Partial<FiscalLead>): Promise<FiscalLead | undefined>;
  deleteFiscalLead(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createJob(job: InsertScrapeJob): Promise<ScrapeJob> {
    const [created] = await db.insert(scrapeJobs).values(job).returning();
    return created;
  }

  async getJob(id: string): Promise<ScrapeJob | undefined> {
    const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    return job;
  }

  async getJobs(status?: string): Promise<ScrapeJob[]> {
    if (status) {
      return db.select().from(scrapeJobs).where(eq(scrapeJobs.status, status)).orderBy(desc(scrapeJobs.startedAt));
    }
    return db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.startedAt));
  }

  async updateJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined> {
    const [updated] = await db.update(scrapeJobs).set(updates).where(eq(scrapeJobs.id, id)).returning();
    return updated;
  }

  async deleteJob(id: string): Promise<void> {
    await db.delete(scrapedResults).where(eq(scrapedResults.jobId, id));
    await db.delete(discoveredPaths).where(eq(discoveredPaths.jobId, id));
    await db.delete(discoveryGraphs).where(eq(discoveryGraphs.jobId, id));
    await db.delete(scrapeJobs).where(eq(scrapeJobs.id, id));
  }

  async createResult(result: InsertScrapedResult): Promise<ScrapedResult> {
    const [created] = await db.insert(scrapedResults).values(result).returning();
    return created;
  }

  async createResultsBatch(results: InsertScrapedResult[]): Promise<void> {
    if (results.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < results.length; i += batchSize) {
      await db.insert(scrapedResults).values(results.slice(i, i + batchSize));
    }
  }

  async getResults(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }, limit: number = 1000, offset: number = 0): Promise<ScrapedResult[]> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(scrapedResults.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(scrapedResults.domain, filters.domain));
    if (filters?.extractorType) conditions.push(eq(scrapedResults.extractorType, filters.extractorType));
    if (filters?.category) conditions.push(eq(scrapedResults.category, filters.category));

    const query = db.select().from(scrapedResults);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(scrapedResults.scrapedAt)).limit(limit).offset(offset);
    }
    return query.orderBy(desc(scrapedResults.scrapedAt)).limit(limit).offset(offset);
  }

  async getResultsCount(filters?: { jobId?: string; domain?: string; extractorType?: string; category?: string }): Promise<number> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(scrapedResults.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(scrapedResults.domain, filters.domain));
    if (filters?.extractorType) conditions.push(eq(scrapedResults.extractorType, filters.extractorType));
    if (filters?.category) conditions.push(eq(scrapedResults.category, filters.category));

    const query = db.select({ count: sql<number>`count(*)` }).from(scrapedResults);
    if (conditions.length > 0) {
      const [row] = await query.where(and(...conditions));
      return Number(row?.count || 0);
    }
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getResultCount(jobId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(scrapedResults).where(eq(scrapedResults.jobId, jobId));
    return Number(row?.count || 0);
  }

  async deleteResultsByJob(jobId: string): Promise<void> {
    await db.delete(scrapedResults).where(eq(scrapedResults.jobId, jobId));
  }

  async createPath(path: InsertDiscoveredPath): Promise<DiscoveredPath> {
    const [created] = await db.insert(discoveredPaths).values(path).returning();
    return created;
  }

  async createPathsBatch(paths: InsertDiscoveredPath[]): Promise<void> {
    if (paths.length === 0) return;
    const batchSize = 100;
    for (let i = 0; i < paths.length; i += batchSize) {
      await db.insert(discoveredPaths).values(paths.slice(i, i + batchSize));
    }
  }

  async getPaths(filters?: { jobId?: string; domain?: string; statusCode?: number }, limit: number = 1000, offset: number = 0): Promise<DiscoveredPath[]> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(discoveredPaths.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(discoveredPaths.domain, filters.domain));
    if (filters?.statusCode) conditions.push(eq(discoveredPaths.statusCode, filters.statusCode));

    const query = db.select().from(discoveredPaths);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(discoveredPaths.statusCode).limit(limit).offset(offset);
    }
    return query.orderBy(discoveredPaths.statusCode).limit(limit).offset(offset);
  }

  async getPathsCount(filters?: { jobId?: string; domain?: string; statusCode?: number }): Promise<number> {
    const conditions = [];
    if (filters?.jobId) conditions.push(eq(discoveredPaths.jobId, filters.jobId));
    if (filters?.domain) conditions.push(eq(discoveredPaths.domain, filters.domain));
    if (filters?.statusCode) conditions.push(eq(discoveredPaths.statusCode, filters.statusCode));

    const query = db.select({ count: sql<number>`count(*)` }).from(discoveredPaths);
    if (conditions.length > 0) {
      const [row] = await query.where(and(...conditions));
      return Number(row?.count || 0);
    }
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async getPathCount(jobId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(discoveredPaths).where(eq(discoveredPaths.jobId, jobId));
    return Number(row?.count || 0);
  }

  async deletePathsByJob(jobId: string): Promise<void> {
    await db.delete(discoveredPaths).where(eq(discoveredPaths.jobId, jobId));
  }

  async getDomainIntel(domain: string): Promise<DomainIntel | undefined> {
    const [intel] = await db.select().from(domainIntel).where(eq(domainIntel.domain, domain));
    return intel;
  }

  async upsertDomainIntel(intel: InsertDomainIntel): Promise<DomainIntel> {
    const existing = await this.getDomainIntel(intel.domain);
    if (existing) {
      const [updated] = await db.update(domainIntel).set({ ...intel, lastScannedAt: new Date() }).where(eq(domainIntel.domain, intel.domain)).returning();
      return updated;
    }
    const [created] = await db.insert(domainIntel).values(intel).returning();
    return created;
  }

  async createConfig(config: InsertScanConfig): Promise<ScanConfig> {
    const [created] = await db.insert(scanConfigs).values(config).returning();
    return created;
  }

  async getConfigs(): Promise<ScanConfig[]> {
    return db.select().from(scanConfigs).orderBy(desc(scanConfigs.createdAt));
  }

  async deleteConfig(id: string): Promise<void> {
    await db.delete(scanConfigs).where(eq(scanConfigs.id, id));
  }

  async saveGraph(graph: InsertDiscoveryGraph): Promise<DiscoveryGraph> {
    await db.delete(discoveryGraphs).where(
      and(eq(discoveryGraphs.jobId, graph.jobId), eq(discoveryGraphs.domain, graph.domain))
    );
    const [created] = await db.insert(discoveryGraphs).values(graph).returning();
    return created;
  }

  async getGraphByJob(jobId: string): Promise<DiscoveryGraph | undefined> {
    const [graph] = await db.select().from(discoveryGraphs).where(eq(discoveryGraphs.jobId, jobId));
    return graph;
  }

  async getGraphByDomain(domain: string): Promise<DiscoveryGraph | undefined> {
    const [graph] = await db.select().from(discoveryGraphs).where(eq(discoveryGraphs.domain, domain)).orderBy(desc(discoveryGraphs.createdAt)).limit(1);
    return graph;
  }

  async getGraphs(): Promise<DiscoveryGraph[]> {
    return db.select().from(discoveryGraphs).orderBy(desc(discoveryGraphs.createdAt)).limit(50);
  }

  async deleteGraphByJob(jobId: string): Promise<void> {
    await db.delete(discoveryGraphs).where(eq(discoveryGraphs.jobId, jobId));
  }

  async createFiscalIntel(item: InsertFiscalIntel): Promise<FiscalIntel> {
    const [created] = await db.insert(fiscalIntel).values(item).returning();
    return created;
  }

  async createFiscalIntelBatch(items: InsertFiscalIntel[]): Promise<void> {
    if (items.length === 0) return;
    const BATCH_SIZE = 100;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      await db.insert(fiscalIntel).values(items.slice(i, i + BATCH_SIZE));
    }
  }

  async getFiscalIntel(company: string, filters?: { source?: string; category?: string }): Promise<FiscalIntel[]> {
    const normalizedCompany = company.toLowerCase().trim();
    const conditions = [sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`];
    if (filters?.source) conditions.push(eq(fiscalIntel.source, filters.source));
    if (filters?.category) conditions.push(eq(fiscalIntel.category, filters.category));
    return db.select().from(fiscalIntel).where(and(...conditions)).orderBy(desc(fiscalIntel.fetchedAt)).limit(200);
  }

  async getFiscalIntelByDomain(domain: string): Promise<FiscalIntel[]> {
    return db.select().from(fiscalIntel).where(eq(fiscalIntel.domain, domain)).orderBy(desc(fiscalIntel.fetchedAt)).limit(200);
  }

  async getFiscalIntelCached(company: string, source: string): Promise<FiscalIntel | undefined> {
    const normalizedCompany = company.toLowerCase().trim();
    const [cached] = await db.select().from(fiscalIntel)
      .where(and(
        sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`,
        eq(fiscalIntel.source, source),
        sql`${fiscalIntel.expiresAt} > now()`
      ))
      .orderBy(desc(fiscalIntel.fetchedAt))
      .limit(1);
    return cached;
  }

  async deleteFiscalIntel(company: string, source?: string): Promise<void> {
    const normalizedCompany = company.toLowerCase().trim();
    const conditions = [sql`lower(${fiscalIntel.company}) = ${normalizedCompany}`];
    if (source) conditions.push(eq(fiscalIntel.source, source));
    await db.delete(fiscalIntel).where(and(...conditions));
  }

  async createFiscalLead(lead: InsertFiscalLead): Promise<FiscalLead> {
    const [created] = await db.insert(fiscalLeads).values(lead).returning();
    return created;
  }

  async getFiscalLead(id: string): Promise<FiscalLead | undefined> {
    const [lead] = await db.select().from(fiscalLeads).where(eq(fiscalLeads.id, id));
    return lead;
  }

  async getFiscalLeadByCompany(company: string): Promise<FiscalLead | undefined> {
    const normalizedCompany = company.toLowerCase().trim();
    const [lead] = await db.select().from(fiscalLeads)
      .where(sql`lower(${fiscalLeads.company}) = ${normalizedCompany}`)
      .limit(1);
    return lead;
  }

  async getFiscalLeads(filters?: { opportunityLevel?: string; pipelineStage?: string }, limit = 100, offset = 0): Promise<FiscalLead[]> {
    const conditions: any[] = [];
    if (filters?.opportunityLevel) conditions.push(eq(fiscalLeads.opportunityLevel, filters.opportunityLevel));
    if (filters?.pipelineStage) conditions.push(eq(fiscalLeads.pipelineStage, filters.pipelineStage));
    const query = conditions.length > 0
      ? db.select().from(fiscalLeads).where(and(...conditions)).orderBy(desc(fiscalLeads.createdAt)).limit(limit).offset(offset)
      : db.select().from(fiscalLeads).orderBy(desc(fiscalLeads.createdAt)).limit(limit).offset(offset);
    return query;
  }

  async getFiscalLeadsCount(filters?: { opportunityLevel?: string; pipelineStage?: string }): Promise<number> {
    const conditions: any[] = [];
    if (filters?.opportunityLevel) conditions.push(eq(fiscalLeads.opportunityLevel, filters.opportunityLevel));
    if (filters?.pipelineStage) conditions.push(eq(fiscalLeads.pipelineStage, filters.pipelineStage));
    const query = conditions.length > 0
      ? db.select({ count: sql`count(*)` }).from(fiscalLeads).where(and(...conditions))
      : db.select({ count: sql`count(*)` }).from(fiscalLeads);
    const [row] = await query;
    return Number(row?.count || 0);
  }

  async updateFiscalLead(id: string, updates: Partial<FiscalLead>): Promise<FiscalLead | undefined> {
    const [updated] = await db.update(fiscalLeads).set({ ...updates, updatedAt: new Date() }).where(eq(fiscalLeads.id, id)).returning();
    return updated;
  }

  async deleteFiscalLead(id: string): Promise<void> {
    await db.delete(fiscalLeads).where(eq(fiscalLeads.id, id));
  }
}

export const storage = new DatabaseStorage();
