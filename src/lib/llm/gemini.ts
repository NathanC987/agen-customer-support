import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";

export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    public reason: "no_key" | "rate_limited" | "error",
  ) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new LlmUnavailableError("GEMINI_API_KEY is not set", "no_key");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export const llmConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

/** Keep latency low on the free tier: minimal thinking for classification, a little for tool use. */
function thinking(level: "none" | "low"): GenerateContentConfig["thinkingConfig"] {
  if (/gemini-2\.5/.test(geminiModel())) return { thinkingBudget: level === "none" ? 0 : 512 };
  if (/gemini-[3-9]/.test(geminiModel())) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryDelayMs(err: ApiError): number | null {
  const m = /retry(?:Delay)?["\s:]*"?(\d+(?:\.\d+)?)s/i.exec(err.message);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

/** Retries transient failures; gives up quickly on long rate-limit waits so the orchestrator can fall back. */
async function call<T>(fn: () => Promise<T>, counter?: { llmCalls: number }): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      if (counter) counter.llmCalls++;
      return await fn();
    } catch (err) {
      if (!(err instanceof ApiError)) throw new LlmUnavailableError(String(err), "error");
      const transient = err.status === 429 || err.status >= 500;
      if (!transient || attempt >= 2) {
        throw new LlmUnavailableError(err.message.slice(0, 300), err.status === 429 ? "rate_limited" : "error");
      }
      const wait = err.status === 429 ? (retryDelayMs(err) ?? 4000 * (attempt + 1)) : 1500 * (attempt + 1);
      if (wait > 20_000) throw new LlmUnavailableError("Gemini rate limit reached", "rate_limited");
      await sleep(wait);
    }
  }
}

export async function generateJson<T>(opts: {
  system: string;
  contents: Content[] | string;
  schema: Record<string, unknown>;
  counter?: { llmCalls: number };
  temperature?: number;
}): Promise<T> {
  const res = await call(
    () =>
      ai().models.generateContent({
        model: geminiModel(),
        contents: opts.contents,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: opts.temperature ?? 0.2,
          thinkingConfig: thinking("none"),
        },
      }),
    opts.counter,
  );
  const text = res.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmUnavailableError(`Model returned invalid JSON: ${text.slice(0, 200)}`, "error");
  }
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** Runs a function-calling loop until the model stops calling tools or maxSteps is reached. */
export async function runToolLoop(opts: {
  system: string;
  contents: Content[];
  tools: FunctionDeclaration[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  onCall?: (rec: { name: string; args: Record<string, unknown> }) => void;
  onResult?: (rec: ToolCallRecord) => void;
  maxSteps?: number;
  counter?: { llmCalls: number };
}): Promise<{ text: string; calls: ToolCallRecord[] }> {
  const contents = [...opts.contents];
  const calls: ToolCallRecord[] = [];
  const maxSteps = opts.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await call(
      () =>
        ai().models.generateContent({
          model: geminiModel(),
          contents,
          config: {
            systemInstruction: opts.system,
            tools: [{ functionDeclarations: opts.tools }],
            temperature: 0.3,
            thinkingConfig: thinking("low"),
          },
        }),
      opts.counter,
    );

    const fnCalls = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (fnCalls.length === 0) return { text: (res.text ?? "").trim(), calls };

    // keep the model turn verbatim (preserves thought signatures for newer models)
    if (modelContent) contents.push(modelContent);
    const responses = [];
    for (const fc of fnCalls) {
      const name = fc.name ?? "unknown";
      const args = (fc.args ?? {}) as Record<string, unknown>;
      opts.onCall?.({ name, args });
      let result: unknown;
      try {
        result = await opts.execute(name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      const rec = { name, args, result };
      calls.push(rec);
      opts.onResult?.(rec);
      responses.push({ functionResponse: { id: fc.id, name, response: { output: result } } });
    }
    contents.push({ role: "user", parts: responses });
  }

  // ran out of steps: ask for a final answer without tools
  const final = await call(
    () =>
      ai().models.generateContent({
        model: geminiModel(),
        contents: [...contents, { role: "user", parts: [{ text: "Summarize the outcome for the customer now. Do not call tools." }] }],
        config: { systemInstruction: opts.system, temperature: 0.3, thinkingConfig: thinking("none") },
      }),
    opts.counter,
  );
  return { text: (final.text ?? "").trim(), calls };
}
