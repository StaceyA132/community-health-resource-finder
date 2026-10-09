import { ResourceCategory, categoryLabels, resourceCategories } from "../data/resources";

export type ChatReply = {
  message: string;
  categories: ResourceCategory[];
  zip?: string;
  emergency: boolean;
};

export const CRISIS_MESSAGE =
  "If you are in immediate danger or having a medical emergency, call 911 now. If you are thinking about suicide or self-harm, call or text 988 (Suicide & Crisis Lifeline) any time.";

const emergencyPattern =
  /\b(attack(?:ed)?|assault(?:ed)?|raped?|overdos(?:e|ed|ing)|suicid(?:e|al)|kill(?:ing)? myself|end(?:ing)? (?:my life|it all)|want to die|hurt(?:ing)? myself|self[- ]?harm|can'?t breathe|not breathing|chest pain|unconscious)\b/i;

// Phone keyboards insert curly apostrophes ("can’t"), so normalize before matching.
export const isEmergency = (message: string) =>
  emergencyPattern.test(message.replace(/[‘’]/g, "'"));

export function validateReply(value: unknown, currentZip: string): ChatReply {
  const reply = (value ?? {}) as Partial<ChatReply>;
  const selected = Array.isArray(reply.categories)
    ? reply.categories.filter((category): category is ResourceCategory =>
        resourceCategories.includes(category as ResourceCategory)
      )
    : [];
  const zip = typeof reply.zip === "string" && /^\d{5}$/.test(reply.zip) ? reply.zip : currentZip;
  const emergency = Boolean(reply.emergency);
  let message =
    typeof reply.message === "string" && reply.message.trim()
      ? reply.message.trim().slice(0, 500)
      : "I can help you find community resources.";

  // Don't rely on the model to include crisis numbers.
  if (emergency && !message.includes("988")) {
    message = `${CRISIS_MESSAGE} ${message}`;
  }

  return { message, categories: selected, zip, emergency };
}

// Word prefixes that suggest each category, for when no AI service is configured.
const categoryKeywords: Record<ResourceCategory, string[]> = {
  "mental-health": ["mental", "counsel", "therap", "anxiety", "anxious", "depress", "stress"],
  "emergency-care": ["emergency", "urgent", "injur"],
  "womens-health": ["women", "woman", "prenatal", "pregnan", "gyn", "reproductive", "birth control"],
  pharmacy: ["pharmac", "prescription", "medication", "medicine", "refill"],
  dental: ["dental", "dentist", "teeth", "tooth", "toothache"],
  food: ["food", "hungry", "meal", "groceries", "grocery", "eat"],
  shelter: ["shelter", "sleep", "housing", "homeless", "a bed"]
};

export function localReply(message: string, zip: string): ChatReply {
  const lower = message.toLowerCase();
  const detected = resourceCategories.filter((category) =>
    categoryKeywords[category].some((keyword) => new RegExp(`\\b${keyword}`).test(lower))
  );
  const detectedZip = message.match(/\b\d{5}\b/)?.[0] ?? zip;

  if (isEmergency(message)) {
    return {
      message: `${CRISIS_MESSAGE} I can also show emergency-care resources, but I can't provide crisis or medical advice.`,
      categories: ["emergency-care"],
      zip: detectedZip,
      emergency: true
    };
  }

  return {
    message: detected.length
      ? `I’ll look for ${detected.map((category) => categoryLabels[category]).join(" and ")} resources near ${detectedZip}.`
      : "I can help find mental-health care, emergency care, women’s health, pharmacies, dental care, food banks, or shelter. What do you need help finding?",
    categories: detected,
    zip: detectedZip,
    emergency: false
  };
}

type ResponsesApiBody = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: unknown }> }>;
};

// The raw Responses API has no `output_text` field (that's an SDK helper), so collect
// the text parts from the message items. Returns null for refusals or empty output.
export function extractOutputText(body: unknown): string | null {
  const output = (body as ResponsesApiBody | null)?.output ?? [];
  const text = output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");

  return text || null;
}
