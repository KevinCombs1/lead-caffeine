import { getSpeedParams } from "./hive-speed";

export async function hiveProxyFetch(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; route: "direct"; routeLabel: string }> {
  const response = await fetch(url, init);
  return { response, route: "direct", routeLabel: "direct" };
}

export function isHiveProxyActive(): boolean {
  return false;
}

export function hasHealthyProxy(): boolean {
  return false;
}

export function getHealthyProxyCount(): number {
  return 0;
}

export function getHiveProxyCount(): number {
  return 0;
}

export function getDelayTier(_healthyCount?: number): { name: string; minMs: number; maxMs: number } {
  const params = getSpeedParams();
  return { name: params.name, minMs: params.delayMin, maxMs: params.delayMax };
}

export function computeWorkerCount(_healthyCount?: number): number {
  return getSpeedParams().workerCount;
}

export function computeDomainGateParams(_proxyCount?: number): { maxConcurrent: number; minGapMs: number } {
  const params = getSpeedParams();
  return { maxConcurrent: params.maxConcurrent, minGapMs: params.minGapMs };
}
