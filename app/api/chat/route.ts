import { NextRequest, NextResponse } from "next/server";
import { ResourceCategory, categoryLabels } from "../../../data/resources";

const categories = Object.keys(categoryLabels) as ResourceCategory[];

type ChatReply = {
  message: string;
  categories: ResourceCategory[];
  zip?: string;
  emergency: boolean;
};

const emergencyPattern = /\b(attack|assault|overdose|suicid(?:e|al)|kill myself|hurt myself|can't breathe|chest pain|unconscious)\b/i;

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
  const lower = message.toLowerCase();
  const detected = categories.filter((category) => {
    const label = categoryLabels[category].toLowerCase();
    return lower.includes(category) || label.split(" ").some((word) => word.length > 3 && lower.includes(word));
  });
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
  const body = (await request.json()) as { message?: unknown; zip?: unknown };
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
    const data = (await response.json()) as { output_text?: string };
    return NextResponse.json(validateReply(JSON.parse(data.output_text ?? "{}"), zip));
  } catch (error) {
    console.error("Chat request failed", error);
    return NextResponse.json(localReply(message, zip));
  }
}
