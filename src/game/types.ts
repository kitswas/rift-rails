export type Phase = string;
export type DimId = string;

export interface SaveState {
  jumpCount: number;
  sectorBag: string[];
  hull: number;
  fuel: number;
  flux: number;
  rep: number;
  energy: number;
  engineTier: number;
  weaponTier: number;
  module: string;
  carriage: string;
  crew: string;
  dimId: DimId;
  dimName: string;
  isSurveyed: boolean;
  seenCutscenes: string[];
  [key: string]: unknown;
}

export interface CutsceneBeat {
  text: string;
  choiceA?: string;
  choiceB?: string;
}

export interface Cutscene {
  id: string;
  beats: CutsceneBeat[];
  logSummary?: string;
}

export interface NavChoice {
  id: DimId;
  name: string;
}
