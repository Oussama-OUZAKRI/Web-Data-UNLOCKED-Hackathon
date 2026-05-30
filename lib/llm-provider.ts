import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function hasLlmConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function llmModel() {
  const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL
  });

  return openrouter.chat(process.env.OPENROUTER_MODEL || DEFAULT_MODEL);
}

export function llmProviderName() {
  return "OpenRouter";
}
