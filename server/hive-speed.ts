export type SpeedModeName = "turtle" | "steady" | "blitz";

export interface SpeedParams {
  name: SpeedModeName;
  label: string;
  delayMin: number;
  delayMax: number;
  maxConcurrent: number;
  minGapMs: number;
  workerCount: number;
}

const SPEED_MODES: Record<SpeedModeName, SpeedParams> = {
  turtle: {
    name: "turtle",
    label: "turtle — super slow",
    delayMin: 15000,
    delayMax: 25000,
    maxConcurrent: 2,
    minGapMs: 15000,
    workerCount: 640,
  },
  steady: {
    name: "steady",
    label: "steady — moderate",
    delayMin: 4000,
    delayMax: 8000,
    maxConcurrent: 8,
    minGapMs: 4000,
    workerCount: 640,
  },
  blitz: {
    name: "blitz",
    label: "blitz — fast",
    delayMin: 800,
    delayMax: 2000,
    maxConcurrent: 32,
    minGapMs: 800,
    workerCount: 640,
  },
};

let currentMode: SpeedModeName = "steady";

export function getSpeedMode(): SpeedModeName {
  return currentMode;
}

export function setSpeedMode(mode: SpeedModeName): void {
  if (!SPEED_MODES[mode]) throw new Error(`Invalid speed mode: ${mode}`);
  currentMode = mode;
  console.log(`[hive-speed] Speed mode set to: ${mode}`);
}

export function getSpeedParams(): SpeedParams {
  return { ...SPEED_MODES[currentMode] };
}

export function getAllSpeedModes(): SpeedParams[] {
  return Object.values(SPEED_MODES).map(m => ({ ...m }));
}
