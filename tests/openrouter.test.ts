import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  OpenAI: class {
    chat = { completions: { create: createMock } };
  }
}));

const catalog = [
  { id: "provider/one:free", architecture: { modality: "text->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature", "max_tokens"] },
  { id: "provider/image-only:free", architecture: { modality: "image->image" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["max_tokens"] },
  { id: "provider/two:free", architecture: { modality: "text+image->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature", "max_tokens"] },
  { id: "provider/agentic-only:free", architecture: { modality: "text->text" }, endpoints: ["/api/alpha/agents"], supported_parameters: ["tools"] },
  { id: "provider/no-max-tokens:free", architecture: { modality: "text->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature"] },
  { id: "provider/three:free", architecture: { modality: "text->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature", "max_tokens"] },
  { id: "provider/four:free", architecture: { modality: "text->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature", "max_tokens"] },
  { id: "provider/five:free", architecture: { modality: "text->text" }, endpoints: ["/api/v1/chat/completions"], supported_parameters: ["temperature", "max_tokens"] }
];

describe("OpenRouter free model fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1");
    createMock.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: catalog }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
  });

  it("requests the standard Chat Completions endpoint and filters incompatible free models", async () => {
    const { freeModels } = await import("../src/openrouter.js");
    const models = await freeModels();
    expect(models.map(model => model.id)).toEqual([
      "provider/one:free",
      "provider/two:free",
      "provider/three:free",
      "provider/four:free",
      "provider/five:free"
    ]);
    const requestedUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get("endpoints")).toBe("/api/v1/chat/completions");
    expect(requestedUrl.searchParams.get("output_modalities")).toBe("text");
  });

  it("falls back when a model returns empty content", async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "   " } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "valid result" } }] });
    const { completeAgent } = await import("../src/openrouter.js");

    await expect(completeAgent("system", { prompt: "weapon" })).resolves.toBe("valid result");
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0]?.[0].model).toBe("provider/one:free");
    expect(createMock.mock.calls[1]?.[0].model).toBe("provider/two:free");
  });

  it("falls back when a free model is restricted to agentic harnesses", async () => {
    createMock
      .mockRejectedValueOnce(Object.assign(
        new Error("thinkingmachines/inkling-2-small:free is only available on agentic harnesses"),
        { status: 403 }
      ))
      .mockResolvedValueOnce({ choices: [{ message: { content: "fallback result" } }] });
    const { completeAgent } = await import("../src/openrouter.js");

    await expect(completeAgent("system", {})).resolves.toBe("fallback result");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("fails fast on permanent authentication errors", async () => {
    createMock.mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }));
    const { completeAgent } = await import("../src/openrouter.js");

    await expect(completeAgent("system", {})).rejects.toThrow("unauthorized");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rotates the first model between calls", async () => {
    createMock
      .mockResolvedValueOnce({ choices: [{ message: { content: "first" } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: "second" } }] });
    const { completeAgent } = await import("../src/openrouter.js");

    await completeAgent("system", {});
    await completeAgent("system", {});
    expect(createMock.mock.calls[0]?.[0].model).toBe("provider/one:free");
    expect(createMock.mock.calls[1]?.[0].model).toBe("provider/two:free");
  });

  it("tries no more than four eligible models for one call", async () => {
    createMock.mockRejectedValue(new Error("temporary upstream failure"));
    const { completeAgent } = await import("../src/openrouter.js");

    await expect(completeAgent("system", {})).rejects.toThrow("temporary upstream failure");
    expect(createMock).toHaveBeenCalledTimes(4);
  });
});
