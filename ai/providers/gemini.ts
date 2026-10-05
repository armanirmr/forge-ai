import { GoogleGenAI } from "@google/genai";
import type { AIProvider, StructuredRequest, StructuredResponse } from "./types";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResponse> {
    const started = Date.now();
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: req.user,
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: req.jsonSchema,
        maxOutputTokens: 8000,
      },
    });

    const text = res.text;
    if (!text) throw new Error("Model returned an empty response");

    // If the text isn't valid JSON, pass the string through as-is: schema
    // validation will reject it and trigger the repair attempt.
    let raw: unknown = text;
    try {
      raw = JSON.parse(text);
    } catch {
      /* handled by validation */
    }

    return {
      raw,
      model: res.modelVersion ?? this.model,
      inputTokens: res.usageMetadata?.promptTokenCount ?? null,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: Date.now() - started,
    };
  }
}