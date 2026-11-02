export type CompassSpeedModeName = "turtle" | "energation" | "caligratos" | "steady" | "blitz";

export interface CompassSpeedParams {
  name: CompassSpeedModeName;
  label: string;
  delayMin: number;
  delayMax: number;
  calcomMaxConcurrent: number;
  calcomMinGapMs: number;
  sourceMaxConcurrent: number;
  sourceMinGapMs: number;
  discoveryWorkerCount: number;
  enrichmentWorkerCount: number;
}

const COMPASS_SPEED_MODES: Record<CompassSpeedModeName, CompassSpeedParams> = {
  turtle: {
    name: "turtle",
    label: "turtle — super slow",
    delayMin: 15000,
    delayMax: 25000,
    calcomMaxConcurrent: 2,
    calcomMinGapMs: 15000,
    sourceMaxConcurrent: 2,
    sourceMinGapMs: 15000,
    discoveryWorkerCount: 8,
    enrichmentWorkerCount: 2,
  },
  energation: {
    name: "energation",
    label: "energation — slow",
    delayMin: 5000,
    delayMax: 11000,
    calcomMaxConcurrent: 3,
    calcomMinGapMs: 5000,
    sourceMaxConcurrent: 4,
    sourceMinGapMs: 5000,
    discoveryWorkerCount: 16,
    enrichmentWorkerCount: 4,
  },
  caligratos: {
    name: "caligratos",
    label: "caligratos — varied",
    delayMin: 3000,
    delayMax: 18000,
    calcomMaxConcurrent: 4,
    calcomMinGapMs: 3000,
    sourceMaxConcurrent: 6,
    sourceMinGapMs: 3000,
    discoveryWorkerCount: 16,
    enrichmentWorkerCount: 4,
  },
  steady: {
    name: "steady",
    label: "steady — moderate",
    delayMin: 4000,
    delayMax: 8000,
    calcomMaxConcurrent: 4,
    calcomMinGapMs: 4000,
    sourceMaxConcurrent: 6,
    sourceMinGapMs: 4000,
    discoveryWorkerCount: 20,
    enrichmentWorkerCount: 1,
  },
  blitz: {
    name: "blitz",
    label: "blitz — fast (enrichment-heavy)",
    delayMin: 800,
    delayMax: 2000,
    calcomMaxConcurrent: 8,
    calcomMinGapMs: 800,
    sourceMaxConcurrent: 10,
    sourceMinGapMs: 800,
    discoveryWorkerCount: 40,
    enrichmentWorkerCount: 10,
  },
};

let currentMode: CompassSpeedModeName = "steady";

export function getSpeedMode(): CompassSpeedModeName {
  return currentMode;
}

export function setSpeedMode(mode: CompassSpeedModeName): void {
  if (!COMPASS_SPEED_MODES[mode]) throw new Error(`Invalid compass speed mode: ${mode}`);
  currentMode = mode;
  console.log(`[compass-speed] Speed mode set to: ${mode}`);
}

export function getSpeedParams(): CompassSpeedParams {
  return { ...COMPASS_SPEED_MODES[currentMode] };
}

export function getAllSpeedModes(): CompassSpeedParams[] {
  return Object.values(COMPASS_SPEED_MODES).map(m => ({ ...m }));
}
