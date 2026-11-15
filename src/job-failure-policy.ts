export type JobFailureClassification = { retryable: boolean; code: string };

export function classifyJobError(error: unknown): JobFailureClassification {
  const candidate = error && typeof error === "object"
    ? error as { status?: unknown; statusCode?: unknown; message?: unknown; code?: unknown }
    : {};
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const rawStatus = Number(candidate.status ?? candidate.statusCode ?? message.match(/\b(408|425|429|5\d{2})\b/)?.[1] ?? 0);
  if (rawStatus === 429) return { retryable: true, code: "provider_rate_limited" };
  if (rawStatus === 408 || rawStatus === 425 || rawStatus >= 500) return { retryable: true, code: "upstream_unavailable" };
  if (/timeout|timed out|aborted|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(message)) {
    return { retryable: true, code: "temporary_network_error" };
  }
  return { retryable: false, code: "generation_failed" };
}

export function retryDelaySeconds(attempt: number): number {
  void attempt;
  return 4;
}
