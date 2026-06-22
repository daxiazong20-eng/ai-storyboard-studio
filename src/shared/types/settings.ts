export type HermesConnectionMode = 'http' | 'cli' | 'mock';

export type AppSettings = {
  hermesMode: HermesConnectionMode;
  hermesBaseUrl: string;
  hermesCliPath: string;
  normalConcurrency: number;
  storyConcurrency: number;
};

export type HermesStatus = {
  state: 'unchecked' | 'unavailable' | 'hermes-ready' | 'grok-logged-out' | 'grok-ready' | 'mock';
  message: string;
  version?: string;
  checkedAt: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  type: 'image' | 'video' | 'text';
  provider: 'hermes-grok';
};
