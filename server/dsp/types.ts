/**
 * Unified DSP Sync Adapter Interface
 * All DSP adapters implement this interface for consistent sync orchestration.
 */

export interface IDspSyncAdapter {
  /** Create or register a new audience segment on the DSP */
  createSegment(name: string): Promise<string>;

  /** Upload a batch of MAIDs to a segment */
  uploadMaidBatch(segmentId: string, maids: string[]): Promise<{ uploaded: number; success: boolean }>;

  /** Get the DSP provider name */
  getProviderName(): string;
}

export interface SyncLogEntry {
  provider: string;
  segmentId: string;
  segmentName: string;
  totalMaids: number;
  uploaded: number;
  success: boolean;
  duration: number;
  error?: string;
  timestamp: string;
}
