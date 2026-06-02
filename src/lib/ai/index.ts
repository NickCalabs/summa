import { OllamaProvider } from "./ollama";
import type { AIProvider } from "./types";

const DEFAULT_ENDPOINT = "http://192.168.1.250:11434";

export function getAIProvider(settings?: {
  endpoint?: string;
  model?: string | null;
}): AIProvider {
  return new OllamaProvider(
    settings?.endpoint || DEFAULT_ENDPOINT,
    settings?.model
  );
}

export type { AIProvider, ExtractedBalance, ModelInfo } from "./types";
