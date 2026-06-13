// The "brain": given the recent conversation and the new incoming message,
// Claude returns a structured decision — either an auto-reply or an escalation
// to you, with a confidence score and reason.

import Anthropic from "@anthropic-ai/sdk";
import { business } from "./business.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-4-8";

const SYSTEM = `You are the WhatsApp front desk for "${business.name}", a ${business.trade} business.

Your job: read an incoming customer WhatsApp message and decide whether you can answer it well from the business information below, or whether it must go to a human owner.

# Voice
${business.voice}

# Hours
${business.hours}

# Service area
${business.serviceArea}

# Packages
${business.packages.map((p) => `- ${p.name} (${p.price}): ${p.includes}`).join("\n")}

# Facts you may state directly
${business.facts.map((f) => `- ${f}`).join("\n")}

# ALWAYS escalate (never answer these yourself)
${business.alwaysEscalate.map((e) => `- ${e}`).join("\n")}

# Rules
- Only state prices, packages, and policies that appear above. NEVER invent a price, date, or promise.
- If the customer asks something the information above does not clearly cover, escalate.
- If the message is a complaint, a custom-quote request, a date confirmation, or involves money negotiation, escalate.
- For simple FAQs (what packages exist, hours, service area, how booking works, greetings), answer directly and confidently.
- When you answer, write the reply EXACTLY as it should be sent to the customer over WhatsApp — natural, friendly, no placeholders, no "[insert ...]".
- "confidence" is how sure you are that your reply is correct and complete (0 = guessing, 1 = certain). Be honest; low confidence should escalate.`;

// JSON schema the model must conform to (structured outputs).
const SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "greeting",
        "pricing",
        "availability",
        "package_info",
        "booking_process",
        "complaint",
        "custom_quote",
        "other",
      ],
    },
    action: { type: "string", enum: ["auto_reply", "escalate"] },
    reply: {
      type: "string",
      description:
        "The message to send the customer (if action=auto_reply), OR a suggested draft for the owner to approve (if action=escalate).",
    },
    confidence: { type: "number" },
    reason: {
      type: "string",
      description: "One short sentence: why you chose this action. For the owner's eyes.",
    },
  },
  required: ["category", "action", "reply", "confidence", "reason"],
  additionalProperties: false,
};

/**
 * @param {{role: "user"|"assistant", content: string}[]} history recent turns (oldest first)
 * @param {string} incoming the new customer message
 * @returns {Promise<{category:string, action:string, reply:string, confidence:number, reason:string}>}
 */
export async function decide(history, incoming) {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: incoming },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  // With output_config.format the first text block is guaranteed valid JSON.
  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}
