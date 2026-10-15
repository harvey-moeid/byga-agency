export const aiProviderIds = [
  "openrouter",
  "cloudflare",
  "gemini",
  "nvidia",
  "cohere",
  "huggingface",
  "mistral",
  "groq",
] as const;

export type AIProvider = (typeof aiProviderIds)[number];

export const aiProviders: Record<
  AIProvider,
  { label: string; defaultModel: string; credential?: string }
> = {
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    credential: "openrouterKey",
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct",
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash-lite",
    credential: "geminiKey",
  },
  nvidia: {
    label: "NVIDIA NIM",
    defaultModel: "meta/llama-3.1-8b-instruct",
    credential: "nvidiaKey",
  },
  cohere: {
    label: "Cohere",
    defaultModel: "command-a-03-2025",
    credential: "cohereKey",
  },
  huggingface: {
    label: "Hugging Face",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    credential: "huggingfaceKey",
  },
  mistral: {
    label: "Mistral",
    defaultModel: "mistral-small-latest",
    credential: "mistralKey",
  },
  groq: {
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    credential: "groqKey",
  },
};
