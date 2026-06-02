export interface ExtractedBalance {
  account: string;
  balance: number;
  currency: string;
  asOfDate?: string;
  confidence: number;
  rawText?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
}

export interface AIProvider {
  extractBalances(text: string, hints?: string): Promise<ExtractedBalance[]>;
  listModels(): Promise<ModelInfo[]>;
  healthCheck(): Promise<{ ok: boolean; model: string; error?: string }>;
}
