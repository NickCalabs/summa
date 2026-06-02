export function buildExtractionPrompt(hints?: string): string {
  return `You are a financial document parser. Extract all account balances from this document.

Return ONLY a JSON array, no other text:
[
  {
    "account": "Human-readable account name",
    "balance": 1234.56,
    "currency": "USD",
    "asOfDate": "2026-05-01",
    "confidence": 0.95
  }
]

Rules:
- Extract EVERY account/balance pair visible in the document
- Use standard ISO currency codes (USD, BTC, ETH, EUR, etc.)
- For crypto quantities, use the raw amount (e.g., 0.65 for 0.65 BTC)
- balance must be a number, not a string
- If you can determine the statement date, include asOfDate
- confidence: 1.0 = clearly stated, 0.7 = inferred, 0.5 = uncertain
- If the document contains no financial data, return an empty array []${hints ? `\n\nAdditional context about this document:\n${hints}` : ""}`;
}
