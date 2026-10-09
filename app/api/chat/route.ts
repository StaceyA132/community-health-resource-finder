import { NextRequest, NextResponse } from "next/server";
import { ResourceCategory, categoryLabels } from "../../../data/resources";

const categories = Object.keys(categoryLabels) as ResourceCategory[];

type ChatReply = {
  message: string;
  categories: ResourceCategory[];
  zip?: string;
  emergency: boolean;
};

const emergencyPattern = /\b(attack|assault|overdose|suicid(?:e|al)|kill myself|hurt myself|can['’]?t breathe|chest pain|unconscious)\b/i;

// Everyday words people use for each category. Matching on label words alone caught generic
// words like "care" and "health", so "dental care" also selected Emergency Care.
const categoryKeywords: Record<ResourceCategory, string[]> = {
  "mental-health": ["mental", "therapy", "therapist", "counsel", "anxiety", "depress", "stress"],
  "emergency-care": ["emergency", "urgent", "hospital", " er "],
  "womens-health": ["women", "woman", "prenatal", "pregnan", "gynec", "birth control", "contracepti"],
  pharmacy: ["pharmac", "prescription", "medication", "medicine", "refill"],
  dental: ["dental", "dentist", "tooth", "teeth"],
  food: ["food", "hungry", "meal", "groceries", " eat "],
  shelter: ["shelter", "housing", "homeless", "sleep", "place to stay", " bed"]
};

// Pull the text out of a raw Responses API payload. `output_text` only exists on the SDK
// helper object, not in the HTTP response.
function extractOutputText(data: unknown): string | undefined {
  const output = (data as { output?: unknown }).output;
  if (!Array.isArray(output)) return undefined;
  for (const item of output) {
    const content = (item as { type?: string; content?: unknown }).content;
    if ((item as { type?: string }).type !== "message" || !Array.isArray(content)) continue;
    for (const part of content) {
      const { type, text } = part as { type?: string; text?: unknown };
      if (type === "output_text" && typeof text === "string") return text;
    }
  }
  return undefined;
}

function validateReply(value: unknown, currentZip: string): ChatReply {
  const reply = value as Partial<ChatReply>;
  const selected = Array.isArray(reply.categories)
    ? reply.categories.filter((category): category is ResourceCategory =>
        categories.includes(category as ResourceCategory)
      )
    : [];
  const zip = typeof reply.zip === "string" && /^\d{5}$/.test(reply.zip) ? reply.zip : currentZip;

  return {
    message:
      typeof reply.message === "string" && reply.message.trim()
        ? reply.message.trim().slice(0, 500)
        : "I can help you find verified community resources.",
    categories: selected,
    zip,
    emergency: Boolean(reply.emergency)
  };
}

function localReply(message: string, zip: string): ChatReply {
  const lower = ` ${message.toLowerCase().replace(/’/g, "'")} `;
  const detected = categories.filter((category) =>
    lower.includes(category) || categoryKeywords[category].some((keyword) => lower.includes(keyword))
  );
  const detectedZip = message.match(/\b\d{5}\b/)?.[0] ?? zip;

  if (emergencyPattern.test(message)) {
    return {
      message: "If you are in immediate danger or having a medical emergency, call 911 now. I can also show emergency-care resources, but I cannot provide crisis or medical advice.",
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

export async function POST(request: NextRequest) {
  let body: { message?: unknown; zip?: unknown };
  try {
    body = (await request.json()) as { message?: unknown; zip?: unknown };
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 750) : "";
  const zip = typeof body.zip === "string" && /^\d{5}$/.test(body.zip) ? body.zip : "94103";

  if (!message) {
    return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
  }

  // Never send urgent messages to a third party; provide the crisis response immediately.
  if (emergencyPattern.test(message) || !process.env.OPENAI_API_KEY) {
    return NextResponse.json(localReply(message, zip));
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5",
        store: false,
        instructions: `You are a friendly resource navigator for a community-health directory. You do not provide medical advice, diagnoses, or treatment instructions. Only help select categories from: ${categories.join(", ")}. Do not claim a resource exists or is available. If the user may be in immediate danger, tell them to call 911 and set emergency true. Return only JSON matching the requested schema.`,
        input: `Current ZIP: ${zip}\nUser message: ${message}`,
        text: {
          format: {
            type: "json_schema",
            name: "resource_navigation",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                message: { type: "string" },
                categories: { type: "array", items: { type: "string", enum: categories } },
                zip: { type: "string" },
                emergency: { type: "boolean" }
              },
              required: ["message", "categories", "zip", "emergency"]
            }
          }
        }
      })
    });

    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const outputText = extractOutputText(await response.json());
    if (!outputText) throw new Error("OpenAI response had no output text");
    return NextResponse.json(validateReply(JSON.parse(outputText), zip));
  } catch (error) {
    console.error("Chat request failed", error);
    return NextResponse.json(localReply(message, zip));
  }
}
