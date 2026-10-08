// Where each provider's OpenAI-compatible API lives. Model ids are never
// hard-coded here - the app asks GET /models and the user picks.

export const PRESETS = {
  claude:     { label: "Claude (Anthropic)",        kind: "claude",      baseUrl: "https://api.anthropic.com/v1", keyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-haiku-5-5" },
  openai:     { label: "OpenAI",                    kind: "openai",      baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
  gemini:     { label: "Google Gemini",             kind: "compatible",  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY" },
  groq:       { label: "Groq",                      kind: "compatible",  baseUrl: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY" },
  openrouter: { label: "OpenRouter",                kind: "compatible",  baseUrl: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
  deepseek:   { label: "DeepSeek",                  kind: "compatible",  baseUrl: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY" },
  xai:        { label: "xAI (Grok)",                kind: "compatible",  baseUrl: "https://api.x.ai/v1", keyEnv: "XAI_API_KEY" },
  mistral:    { label: "Mistral",                   kind: "compatible",  baseUrl: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY" },
  ollama:     { label: "Ollama (local, no key)",    kind: "compatible",  baseUrl: "http://localhost:11434/v1", noKey: true },
  custom:     { label: "Other OpenAI-compatible…",  kind: "compatible",  baseUrl: "", keyEnv: "DECOMP_API_KEY" },
};

// Fill a { kind, baseUrl, apiKey, model, label } from a preset id plus what the user saved.
export function resolveProvider(id, { apiKey, model, baseUrl } = {}) {
  const p = PRESETS[id] || PRESETS.claude;
  const resolved = {
    id, kind: p.kind, label: p.label, noKey: !!p.noKey,
    baseUrl: (baseUrl || p.baseUrl || "").replace(/\/+$/, ""),
    apiKey: apiKey || (p.keyEnv ? process.env[p.keyEnv] : "") || "",
    model: model || p.defaultModel || "",
  };
  if (!resolved.noKey && !resolved.apiKey) throw new Error(`${p.label}: add your API key in Settings.`);
  if (!resolved.baseUrl) throw new Error(`${p.label}: enter the API base URL in Settings.`);
  if (!resolved.model) throw new Error(`${p.label}: choose a model in Settings (Load Models).`);
  return resolved;
}
