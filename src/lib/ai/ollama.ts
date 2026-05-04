import type { AIProvider, ExtractedBalance, ModelInfo } from "./types";
import { buildExtractionPrompt } from "./prompts";

export class OllamaProvider implements AIProvider {
  constructor(
    private endpoint: string,
    private model?: string | null
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.endpoint}/api/tags`);
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    return (data.models || [])
      .filter((m: any) => !m.details?.family?.includes("bert"))
      .map((m: any) => ({
        id: m.name as string,
        name: m.name as string,
        size: (m.details?.parameter_size as string) || undefined,
      }));
  }

  async healthCheck(): Promise<{ ok: boolean; model: string; error?: string }> {
    try {
      const models = await this.listModels();
      const model = this.model || selectBestModel(models);
      return { ok: true, model };
    } catch (e: any) {
      return { ok: false, model: "", error: e.message };
    }
  }

  async extractBalances(
    text: string,
    hints?: string
  ): Promise<ExtractedBalance[]> {
    const models = await this.listModels();
    const model = this.model || selectBestModel(models);
    const systemPrompt = buildExtractionPrompt(hints);

    const res = await fetch(`${this.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        format: "json",
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama extraction failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    const rawContent: string = data.message?.content || "";
    return parseExtractedBalances(rawContent);
  }
}

export function selectBestModel(models: ModelInfo[]): string {
  if (models.length === 0) throw new Error("No models installed on Ollama");

  const sorted = [...models].sort((a, b) => {
    return parseModelSize(b.size) - parseModelSize(a.size);
  });

  return sorted[0].id;
}

export function parseModelSize(size?: string): number {
  if (!size) return 0;
  const match = size.match(/([\d.]+)\s*(B|M|K)/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === "B") return num * 1e9;
  if (unit === "M") return num * 1e6;
  if (unit === "K") return num * 1e3;
  return num;
}

export function parseExtractedBalances(content: string): ExtractedBalance[] {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  const parsed = JSON.parse(cleaned);

  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : parsed.balances || parsed.accounts || parsed.data || [];

  return arr.map((item: any) => ({
    account: String(item.account || item.name || "Unknown"),
    balance: Number(item.balance ?? item.amount ?? 0),
    currency: String(item.currency || "USD"),
    asOfDate: item.asOfDate || item.as_of_date || item.date || undefined,
    confidence: Number(item.confidence ?? 0.5),
    rawText: item.rawText || item.raw_text || undefined,
  }));
}
