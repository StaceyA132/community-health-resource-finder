import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ZIP, resourceCategories } from "../../../data/resources";
import { extractOutputText, isEmergency, localReply, validateReply } from "../../../lib/chat";

export async function POST(request: NextRequest) {
  let body: { message?: unknown; zip?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 750) : "";
  const zip = typeof body.zip === "string" && /^\d{5}$/.test(body.zip) ? body.zip : DEFAULT_ZIP;

  if (!message) {
    return NextResponse.json({ error: "Please enter a message." }, { status: 400 });
  }

  // Never send urgent messages to a third party; provide the crisis response immediately.
  if (isEmergency(message) || !process.env.OPENAI_API_KEY) {
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
        instructions: `You are a friendly resource navigator for a community-health directory. You do not provide medical advice, diagnoses, or treatment instructions. Only help select categories from: ${resourceCategories.join(", ")}. Do not claim a resource exists or is available. If the user may be in immediate danger, tell them to call 911 (or call or text 988 for suicide or self-harm) and set emergency true. Return only JSON matching the requested schema.`,
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
                categories: { type: "array", items: { type: "string", enum: resourceCategories } },
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
    const text = extractOutputText(await response.json());
    if (!text) throw new Error("OpenAI response had no text output");
    return NextResponse.json(validateReply(JSON.parse(text), zip));
  } catch (error) {
    console.error("Chat request failed", error);
    return NextResponse.json(localReply(message, zip));
  }
}
