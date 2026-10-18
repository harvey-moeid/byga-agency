// Shared by the settings UI and Worker: exactly two supported models per provider.
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
export interface AIModel {
  id: string;
  label: string;
  description: string;
}
interface Provider {
  label: string;
  defaultModel: string;
  credential?: string;
  models: readonly [AIModel, AIModel];
  docs: string;
}
export const aiProviders: Record<AIProvider, Provider> = {
  openrouter: {
    label: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    credential: "openrouterKey",
    docs: "https://openrouter.ai/models",
    models: [
      {
        id: "openai/gpt-4o-mini",
        label: "GPT-4o mini",
        description: "Pilihan ringan untuk caption dan ide harian.",
      },
      {
        id: "openai/gpt-4.1-mini",
        label: "GPT-4.1 mini",
        description:
          "Untuk brief terperinci dan instruksi yang lebih kompleks.",
      },
    ],
  },
  cloudflare: {
    label: "Cloudflare Workers AI",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct-fast",
    docs: "https://developers.cloudflare.com/workers-ai/models/",
    models: [
      {
        id: "@cf/meta/llama-3.1-8b-instruct-fast",
        label: "Llama 3.1 8B · Fast",
        description: "Untuk draft singkat melalui binding Workers AI.",
      },
      {
        id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        label: "Llama 3.3 70B · Fast",
        description: "Untuk naskah dan konteks cerita yang lebih terperinci.",
      },
    ],
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash-lite",
    credential: "geminiKey",
    docs: "https://ai.google.dev/gemini-api/docs/models",
    models: [
      {
        id: "gemini-2.5-flash-lite",
        label: "Gemini 2.5 Flash-Lite",
        description: "Untuk ide cepat dan pembuatan konten harian.",
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Untuk storyboard dan penulisan yang lebih terperinci.",
      },
    ],
  },
  nvidia: {
    label: "NVIDIA NIM",
    defaultModel: "meta/llama-3.1-8b-instruct",
    credential: "nvidiaKey",
    docs: "https://docs.api.nvidia.com/nim/reference/llm-apis",
    models: [
      {
        id: "meta/llama-3.1-8b-instruct",
        label: "Llama 3.1 8B",
        description: "Untuk ide, ringkasan, dan draft singkat.",
      },
      {
        id: "meta/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B",
        description: "Untuk cerita multibahasa dan instruksi terperinci.",
      },
    ],
  },
  cohere: {
    label: "Cohere",
    defaultModel: "command-a-03-2025",
    credential: "cohereKey",
    docs: "https://docs.cohere.com/docs/models",
    models: [
      {
        id: "command-a-03-2025",
        label: "Command A",
        description: "Untuk brief panjang dan penulisan multibahasa.",
      },
      {
        id: "command-r-08-2024",
        label: "Command R",
        description: "Untuk ringkasan referensi dan draft berbasis konteks.",
      },
    ],
  },
  huggingface: {
    label: "Hugging Face",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    credential: "huggingfaceKey",
    docs: "https://huggingface.co/docs/inference-providers/index",
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct",
        label: "Llama 3.3 70B Instruct",
        description: "Untuk naskah kreatif melalui Inference Providers.",
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        label: "Qwen 2.5 72B Instruct",
        description:
          "Alternatif multibahasa; bergantung pada ketersediaan penyedia inferensi.",
      },
    ],
  },
  mistral: {
    label: "Mistral",
    defaultModel: "mistral-small-latest",
    credential: "mistralKey",
    docs: "https://docs.mistral.ai/models/",
    models: [
      {
        id: "mistral-small-latest",
        label: "Mistral Small",
        description: "Untuk caption, ide, dan pekerjaan harian.",
      },
      {
        id: "mistral-large-latest",
        label: "Mistral Large",
        description: "Untuk instruksi kompleks dan naskah yang lebih panjang.",
      },
    ],
  },
  groq: {
    label: "Groq",
    defaultModel: "openai/gpt-oss-120b",
    credential: "groqKey",
    docs: "https://console.groq.com/docs/models",
    models: [
      {
        id: "openai/gpt-oss-120b",
        label: "GPT OSS 120B",
        description: "Untuk penalaran dan pengembangan cerita terperinci.",
      },
      {
        id: "openai/gpt-oss-20b",
        label: "GPT OSS 20B",
        description: "Alternatif ringan untuk ide dan draft cepat.",
      },
    ],
  },
};
export function isProviderModel(provider: AIProvider, model: string): boolean {
  return aiProviders[provider].models.some((choice) => choice.id === model);
}
// Read-time migration preserves workspace data and repairs retired/custom model IDs.
export function normalizeAISettings<
  T extends { provider: AIProvider; model: string },
>(settings: T): T {
  const provider = aiProviderIds.includes(settings.provider)
    ? settings.provider
    : "openrouter";
  const legacyGroq =
    provider === "groq" && settings.model === "llama-3.1-8b-instant";
  const model = isProviderModel(provider, settings.model)
    ? settings.model
    : legacyGroq
      ? "openai/gpt-oss-20b"
      : aiProviders[provider].defaultModel;
  return { ...settings, provider, model };
}
