import { db } from "./db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
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
  portfolioAllocations, type PortfolioAllocation, type InsertPortfolioAllocation,
  hiveDirectories, type HiveDirectory, type InsertHiveDirectory,
  hiveCategories, type HiveCategory, type InsertHiveCategory,
  hiveLocations, type HiveLocation, type InsertHiveLocation,
  hiveCrawlJobs, type HiveCrawlJob, type InsertHiveCrawlJob,
  hiveFlowers, type HiveFlower, type InsertHiveFlower,
  hivePollen, type HivePollen, type InsertHivePollen,
  hiveCompletedCombos, type HiveCompletedCombo,
} from "@shared/schema";
import { ilike, or, count, inArray } from "drizzle-orm";

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

  allocateToPortfolio(allocation: InsertPortfolioAllocation): Promise<PortfolioAllocation>;
  allocateToPortfolioBatch(allocations: InsertPortfolioAllocation[]): Promise<void>;
  getPortfolioAllocations(): Promise<PortfolioAllocation[]>;
  getPortfolioAllocation(leadId: string): Promise<PortfolioAllocation | undefined>;
  removeFromPortfolio(leadId: string): Promise<void>;
  clearPortfolio(): Promise<void>;

  getHiveDirectories(): Promise<HiveDirectory[]>;
  getHiveCategories(): Promise<HiveCategory[]>;
  getHiveLocations(): Promise<HiveLocation[]>;
  createHiveCrawlJob(job: InsertHiveCrawlJob): Promise<HiveCrawlJob>;
  updateHiveCrawlJob(id: string, updates: Partial<HiveCrawlJob>): Promise<HiveCrawlJob | undefined>;
  getHiveCrawlJobs(): Promise<HiveCrawlJob[]>;
  getHiveCrawlJob(id: string): Promise<HiveCrawlJob | undefined>;
  appendCrawlLog(jobId: string, message: string): Promise<void>;
  bulkInsertFlowers(flowers: InsertHiveFlower[]): Promise<number>;
  bulkInsertPollen(pollen: InsertHivePollen[]): Promise<number>;
  getHiveFlowers(filters: { directory?: string; category?: string; categories?: string; city?: string; state?: string; search?: string; isAlive?: boolean; sortBy?: string; beauteousOnly?: boolean; tag?: string; crawlJobId?: string; page?: number; limit?: number }): Promise<{ flowers: HiveFlower[]; total: number }>;
  getHivePollen(filters: { search?: string; category?: string; categories?: string; state?: string; directory?: string; crawlJobId?: string; sortBy?: string; page?: number; limit?: number }): Promise<{ pollen: HivePollen[]; total: number }>;
  deleteFlower(id: string): Promise<void>;
  updateFlowerHealth(id: string, isAlive: boolean): Promise<void>;
  updateFlowerBeauty(id: string, beautyScore: number, beautyFlags: string): Promise<void>;
  getFlowersForBeautyScan(rescan: boolean): Promise<{ id: string; website: string }[]>;
  getHiveStats(): Promise<{ totalFlowers: number; totalPollen: number; byDirectory: Record<string, number>; byCategory: Record<string, number> }>;
  getHiveCoverage(): Promise<{ category: string; city: string; state: string; count: number }[]>;
  getHiveDirectoryCount(): Promise<number>;
  getHiveCategoryCount(): Promise<number>;
  getHiveLocationCount(): Promise<number>;
  markComboCompleted(directoryId: string, categoryId: string, locationId: string, flowersFound: number, pollenFound: number): Promise<void>;
  isComboCompleted(directoryId: string, categoryId: string, locationId: string): Promise<boolean>;
  getCompletedCombosCount(): Promise<number>;
  clearCompletedCombos(): Promise<void>;
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

  async allocateToPortfolio(allocation: InsertPortfolioAllocation): Promise<PortfolioAllocation> {
    const [created] = await db.insert(portfolioAllocations).values(allocation).returning();
    return created;
  }

  async allocateToPortfolioBatch(allocations: InsertPortfolioAllocation[]): Promise<void> {
    if (allocations.length === 0) return;
    await db.insert(portfolioAllocations).values(allocations);
  }

  async getPortfolioAllocations(): Promise<PortfolioAllocation[]> {
    return db.select().from(portfolioAllocations).orderBy(desc(portfolioAllocations.allocatedAt));
  }

  async getPortfolioAllocation(leadId: string): Promise<PortfolioAllocation | undefined> {
    const [alloc] = await db.select().from(portfolioAllocations).where(eq(portfolioAllocations.leadId, leadId));
    return alloc;
  }

  async removeFromPortfolio(leadId: string): Promise<void> {
    await db.delete(portfolioAllocations).where(eq(portfolioAllocations.leadId, leadId));
  }

  async clearPortfolio(): Promise<void> {
    await db.delete(portfolioAllocations);
  }

  async getHiveDirectories(): Promise<HiveDirectory[]> {
    return db.select().from(hiveDirectories);
  }

  async getHiveCategories(): Promise<HiveCategory[]> {
    return db.select().from(hiveCategories);
  }

  async getHiveLocations(): Promise<HiveLocation[]> {
    return db.select().from(hiveLocations);
  }

  async createHiveCrawlJob(job: InsertHiveCrawlJob): Promise<HiveCrawlJob> {
    const [created] = await db.insert(hiveCrawlJobs).values(job).returning();
    return created;
  }

  async updateHiveCrawlJob(id: string, updates: Partial<HiveCrawlJob>): Promise<HiveCrawlJob | undefined> {
    const [updated] = await db.update(hiveCrawlJobs).set(updates).where(eq(hiveCrawlJobs.id, id)).returning();
    return updated;
  }

  async getHiveCrawlJobs(): Promise<HiveCrawlJob[]> {
    return db.select().from(hiveCrawlJobs).orderBy(desc(hiveCrawlJobs.startedAt)).limit(20);
  }

  async getHiveCrawlJob(id: string): Promise<HiveCrawlJob | undefined> {
    const [job] = await db.select().from(hiveCrawlJobs).where(eq(hiveCrawlJobs.id, id));
    return job;
  }

  async appendCrawlLog(jobId: string, message: string): Promise<void> {
    await db.execute(sql`UPDATE hive_crawl_jobs SET log = array_append(log, ${message}) WHERE id = ${jobId}`);
  }

  async bulkInsertFlowers(flowers: InsertHiveFlower[]): Promise<number> {
    if (flowers.length === 0) return 0;
    let inserted = 0;
    const batchSize = 50;
    for (let i = 0; i < flowers.length; i += batchSize) {
      const batch = flowers.slice(i, i + batchSize);
      const result = await db.insert(hiveFlowers).values(batch).onConflictDoNothing({ target: hiveFlowers.normalizedUrl }).returning();
      inserted += result.length;
    }
    return inserted;
  }

  async bulkInsertPollen(pollen: InsertHivePollen[]): Promise<number> {
    if (pollen.length === 0) return 0;
    let inserted = 0;
    const batchSize = 50;
    for (let i = 0; i < pollen.length; i += batchSize) {
      const batch = pollen.slice(i, i + batchSize);
      const result = await db.insert(hivePollen).values(batch).onConflictDoNothing().returning();
      inserted += result.length;
    }
    return inserted;
  }

  async getHiveFlowers(filters: { directory?: string; category?: string; categories?: string; city?: string; state?: string; search?: string; isAlive?: boolean; sortBy?: string; beauteousOnly?: boolean; tag?: string; crawlJobId?: string; page?: number; limit?: number }): Promise<{ flowers: HiveFlower[]; total: number }> {
    const conditions: any[] = [];
    if (filters.directory) conditions.push(eq(hiveFlowers.sourceDirectory, filters.directory));
    if (filters.categories) conditions.push(inArray(hiveFlowers.category, filters.categories.split(",")));
    else if (filters.category) conditions.push(eq(hiveFlowers.category, filters.category));
    if (filters.city) conditions.push(eq(hiveFlowers.city, filters.city));
    if (filters.state) conditions.push(eq(hiveFlowers.state, filters.state));
    if (filters.isAlive !== undefined) conditions.push(eq(hiveFlowers.isAlive, filters.isAlive));
    if (filters.beauteousOnly) conditions.push(sql`beauty_score >= 90`);
    if (filters.tag) conditions.push(sql`(${hiveFlowers.city}, ${hiveFlowers.state}) IN (SELECT city, state FROM hive_locations WHERE tag = ${filters.tag})`);
    if (filters.crawlJobId) conditions.push(eq(hiveFlowers.crawlJobId, filters.crawlJobId));
    if (filters.search) {
      conditions.push(or(
        ilike(hiveFlowers.name, `%${filters.search}%`),
        ilike(hiveFlowers.website, `%${filters.search}%`)
      ));
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(hiveFlowers).where(whereClause);
    const total = Number(countRow?.count || 0);

    let orderClause;
    if (filters.sortBy === "beauty") {
      orderClause = sql`beauty_score DESC NULLS LAST`;
    } else if (filters.sortBy === "name") {
      orderClause = sql`name ASC`;
    } else if (filters.sortBy === "category") {
      orderClause = sql`category ASC, name ASC`;
    } else if (filters.sortBy === "state") {
      orderClause = sql`state ASC, city ASC, name ASC`;
    } else {
      orderClause = sql`created_at DESC`;
    }

    const flowers = await db.select().from(hiveFlowers).where(whereClause).orderBy(orderClause).limit(limit).offset(offset);

    return { flowers, total };
  }

  async getHivePollen(filters: { search?: string; category?: string; categories?: string; state?: string; directory?: string; crawlJobId?: string; sortBy?: string; page?: number; limit?: number }): Promise<{ pollen: HivePollen[]; total: number }> {
    const conditions: any[] = [];
    if (filters.search) {
      conditions.push(ilike(hivePollen.name, `%${filters.search}%`));
    }
    if (filters.category) {
      if (filters.category.startsWith("bundle:")) {
        const bundleName = filters.category.slice(7);
        const cats = await db.select({ name: hiveCategories.name }).from(hiveCategories).where(eq(hiveCategories.bundle, bundleName));
        if (cats.length > 0) {
          conditions.push(inArray(hivePollen.category, cats.map(c => c.name)));
        }
      } else {
        conditions.push(eq(hivePollen.category, filters.category));
      }
    }
    if (filters.categories) {
      const catList = filters.categories.split(",").map(s => s.trim()).filter(Boolean);
      if (catList.length > 0) conditions.push(inArray(hivePollen.category, catList));
    }
    if (filters.state) {
      conditions.push(eq(hivePollen.state, filters.state));
    }
    if (filters.directory) {
      conditions.push(eq(hivePollen.sourceDirectory, filters.directory));
    }
    if (filters.crawlJobId) {
      conditions.push(eq(hivePollen.crawlJobId, filters.crawlJobId));
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(hivePollen).where(whereClause);
    const total = Number(countRow?.count || 0);

    let orderBy: any = desc(hivePollen.createdAt);
    if (filters.sortBy === "category") orderBy = asc(hivePollen.category);
    else if (filters.sortBy === "state") orderBy = asc(hivePollen.state);
    else if (filters.sortBy === "name") orderBy = asc(hivePollen.name);

    const pollen = await db.select().from(hivePollen).where(whereClause).orderBy(orderBy).limit(limit).offset(offset);

    return { pollen, total };
  }

  async deleteFlower(id: string): Promise<void> {
    await db.delete(hiveFlowers).where(eq(hiveFlowers.id, id));
  }

  async updateFlowerHealth(id: string, isAlive: boolean): Promise<void> {
    await db.update(hiveFlowers).set({ isAlive, lastChecked: new Date() }).where(eq(hiveFlowers.id, id));
  }

  async updateFlowerBeauty(id: string, beautyScore: number, beautyFlags: string): Promise<void> {
    await db.update(hiveFlowers).set({ beautyScore, beautyFlags }).where(eq(hiveFlowers.id, id));
  }

  async getFlowersForBeautyScan(rescan: boolean): Promise<{ id: string; website: string }[]> {
    if (rescan) {
      return db.select({ id: hiveFlowers.id, website: hiveFlowers.website }).from(hiveFlowers);
    }
    return db.select({ id: hiveFlowers.id, website: hiveFlowers.website }).from(hiveFlowers).where(sql`beauty_score IS NULL`);
  }

  async getHiveStats(): Promise<{ totalFlowers: number; totalPollen: number; byDirectory: Record<string, number>; byCategory: Record<string, number> }> {
    const [flowerCount] = await db.select({ count: sql<number>`count(*)` }).from(hiveFlowers);
    const [pollenCount] = await db.select({ count: sql<number>`count(*)` }).from(hivePollen);

    const dirCounts = await db.select({
      dir: hiveFlowers.sourceDirectory,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.sourceDirectory);

    const catCounts = await db.select({
      cat: hiveFlowers.category,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.category);

    const byDirectory: Record<string, number> = {};
    for (const r of dirCounts) byDirectory[r.dir] = Number(r.count);

    const byCategory: Record<string, number> = {};
    for (const r of catCounts) byCategory[r.cat] = Number(r.count);

    return {
      totalFlowers: Number(flowerCount?.count || 0),
      totalPollen: Number(pollenCount?.count || 0),
      byDirectory,
      byCategory
    };
  }

  async getHiveCoverage(): Promise<{ category: string; city: string; state: string; count: number }[]> {
    const rows = await db.select({
      category: hiveFlowers.category,
      city: hiveFlowers.city,
      state: hiveFlowers.state,
      count: sql<number>`count(*)`
    }).from(hiveFlowers).groupBy(hiveFlowers.category, hiveFlowers.city, hiveFlowers.state);

    return rows.map(r => ({
      category: r.category,
      city: r.city || "",
      state: r.state || "",
      count: Number(r.count)
    }));
  }

  async getHiveDirectoryCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveDirectories);
    return Number(row?.count || 0);
  }

  async getHiveCategoryCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveCategories);
    return Number(row?.count || 0);
  }

  async getHiveLocationCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveLocations);
    return Number(row?.count || 0);
  }

  async markComboCompleted(directoryId: string, categoryId: string, locationId: string, flowersFound: number, pollenFound: number): Promise<void> {
    await db.insert(hiveCompletedCombos).values({ directoryId, categoryId, locationId, flowersFound, pollenFound }).onConflictDoUpdate({
      target: [hiveCompletedCombos.directoryId, hiveCompletedCombos.categoryId, hiveCompletedCombos.locationId],
      set: { flowersFound, pollenFound, completedAt: new Date() },
    });
  }

  async isComboCompleted(directoryId: string, categoryId: string, locationId: string): Promise<boolean> {
    const [row] = await db.select({ id: hiveCompletedCombos.id }).from(hiveCompletedCombos).where(
      and(eq(hiveCompletedCombos.directoryId, directoryId), eq(hiveCompletedCombos.categoryId, categoryId), eq(hiveCompletedCombos.locationId, locationId))
    );
    return !!row;
  }

  async getCompletedCombosCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(hiveCompletedCombos);
    return Number(row?.count || 0);
  }

  async clearCompletedCombos(): Promise<void> {
    await db.delete(hiveCompletedCombos);
  }
}

export const storage = new DatabaseStorage();
