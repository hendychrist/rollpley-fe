import type { CandidateSuggestion, NameSuggestionsResult } from "@/type/payroll";

/**
 * Parse the JSON-encoded `Candidate` field on a PayrollMatch into
 * a typed array. Returns [] on any parse error or empty string.
 */
export function parseCandidateSuggestions(candidateJson: string): CandidateSuggestion[] {
  if (!candidateJson || candidateJson === "null") return [];
  try {
    const parsed = JSON.parse(candidateJson);
    if (!Array.isArray(parsed)) return [];
    return parsed as CandidateSuggestion[];
  } catch {
    return [];
  }
}

/**
 * Extract CandidateSuggestion[] from a NameSuggestionsResult (GET endpoint).
 * The response has the same Candidate JSON shape as PayrollMatch.
 * Returns [] when the query hasn't loaded or when no candidates found.
 */
export function parseNameSuggestionsFromQuery(result: NameSuggestionsResult | undefined): CandidateSuggestion[] {
  if (!result) return [];
  return parseCandidateSuggestions(result.Candidate);
}
