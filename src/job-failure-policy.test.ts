import { describe, expect, it } from "vitest";
import { classifyJobError, retryDelaySeconds } from "./job-failure-policy.js";

describe("classifyJobError", () => {
  it("retries provider rate limits", () => {
    expect(classifyJobError(new Error("429 Provider returned error"))).toEqual({ retryable: true, code: "provider_rate_limited" });
  });
  it("retries upstream 5xx and timeouts", () => {
    expect(classifyJobError({ status: 503, message: "unavailable" })).toEqual({ retryable: true, code: "upstream_unavailable" });
    expect(classifyJobError(new Error("request timeout"))).toEqual({ retryable: true, code: "temporary_network_error" });
  });
  it("does not retry permanent client errors", () => {
    expect(classifyJobError({ statusCode: 400, message: "invalid request" })).toEqual({ retryable: false, code: "generation_failed" });
  });
});

describe("retryDelaySeconds", () => {
  it("uses bounded exponential backoff", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([20, 40, 80, 120]);
  });
});
