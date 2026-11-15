import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  OpenAI: class {
    chat = { completions: { create: createMock } };
  }
}));

const catalog = [
  { id: "provider/one:free", architecture: { modality: "text->text" } },
  { id: "provider/image-only:free", architecture: { modality: "image->image" } },
  { id: "provider/two:free", architecture: { modality: "text+image->text" } },
  { id: "provider/three:free", architecture: { modality: "text->text" } },
  { id: "provider/four:free", architecture: { modality: "text->text" } },
  { id: "provider/five:free", architecture: { modality: "text->text" } }
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

  it("skips free models that cannot accept text", async () => {
    const { freeModels } = await import("../src/openrouter.js");
    const models = await freeModels();
    expect(models.map(model => model.id)).toEqual([
      "provider/one:free",
      "provider/two:free",
      "provider/three:free",
      "provider/four:free",
      "provider/five:free"
    ]);
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
