// samarapix WhatsApp auto-reply bot (PROTOTYPE).
//
// One process that:
//   1. Logs into WhatsApp via QR (whatsapp-web.js).
//   2. On each incoming customer message, asks Claude to decide: auto-reply or escalate.
//   3. Auto-sends confident answers; escalates the rest to you (forward + review queue).
//   4. Serves a tiny local dashboard to approve/edit/send escalated replies.
//
// ⚠️  whatsapp-web.js logs in as your number via WhatsApp Web. This is against
//     WhatsApp's Terms of Service and the number CAN be banned. Test with a
//     spare number first. This bot only replies to people who message you
//     (inbound) — it does not send unsolicited/bulk messages.

import "dotenv/config";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import express from "express";

import { decide } from "./claude.js";
import * as queue from "./queue.js";

const OWNER = process.env.OWNER_NUMBER;
const THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? 0.75);
const APPROVAL_MODE = String(process.env.APPROVAL_MODE ?? "true") === "true";
const REVIEW_PORT = Number(process.env.REVIEW_PORT ?? 3000);

if (!OWNER) {
  console.error("Set OWNER_NUMBER in .env (e.g. 919876543210@c.us)");
  process.exit(1);
}

// --- In-memory short conversation history per chat (last few turns) ----------
const HISTORY_TURNS = 6;
const histories = new Map(); // chatId -> [{role, content}]

function remember(chatId, role, content) {
  const h = histories.get(chatId) ?? [];
  h.push({ role, content });
  while (h.length > HISTORY_TURNS) h.shift();
  histories.set(chatId, h);
}

// --- WhatsApp client ---------------------------------------------------------
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./.wwebjs_auth" }),
  puppeteer: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

client.on("qr", (qr) => {
  console.log("\nScan this QR with WhatsApp → Linked devices:\n");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ WhatsApp connected. Listening for messages.");
  console.log(`   Mode: ${APPROVAL_MODE ? "APPROVAL (nothing auto-sent)" : "AUTO-REPLY"}`);
  console.log(`   Review dashboard: http://localhost:${REVIEW_PORT}\n`);
});

client.on("message", async (msg) => {
  // Ignore group chats, status broadcasts, and your own messages.
  if (msg.from === "status@broadcast" || msg.from.endsWith("@g.us") || msg.fromMe) return;
  // Don't react to the owner's own DMs to the bot number.
  if (msg.from === OWNER) return;

  const chatId = msg.from;
  const incoming = (msg.body || "").trim();
  if (!incoming) return;

  console.log(`📩 ${chatId}: ${incoming}`);
  remember(chatId, "user", incoming);

  let decision;
  try {
    decision = await decide(histories.get(chatId).slice(0, -1), incoming);
  } catch (err) {
    console.error("Claude error:", err.message);
    await escalate(chatId, incoming, "(Claude was unavailable — please reply manually.)", "error", "system_error");
    return;
  }

  const shouldEscalate =
    decision.action === "escalate" || decision.confidence < THRESHOLD || APPROVAL_MODE;

  console.log(
    `   → ${shouldEscalate ? "ESCALATE" : "AUTO-REPLY"} ` +
      `[${decision.category}, conf ${decision.confidence.toFixed(2)}] ${decision.reason}`,
  );

  if (shouldEscalate) {
    await escalate(chatId, incoming, decision.reply, decision.reason, decision.category);
  } else {
    await client.sendMessage(chatId, decision.reply);
    remember(chatId, "assistant", decision.reply);
  }
});

async function escalate(chatId, incoming, draft, reason, category) {
  const item = queue.enqueue({ chatId, customer: chatId, incoming, draft, reason, category });
  const note =
    `🔔 *Needs you* (${category})\n` +
    `From: ${chatId}\n` +
    `They said: ${incoming}\n` +
    `Why: ${reason}\n\n` +
    `Suggested reply:\n${draft}\n\n` +
    `Review/approve: http://localhost:${REVIEW_PORT} (id ${item.id})`;
  try {
    await client.sendMessage(OWNER, note);
  } catch (err) {
    console.error("Could not notify owner:", err.message);
  }
}

// --- Review dashboard (same process, so it can send via the live client) -----
const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  const items = queue.pending();
  res.send(`<!doctype html><meta charset="utf8"><title>samarapix review</title>
  <style>
    body{font:15px/1.5 system-ui;margin:0 auto;max-width:720px;padding:24px;background:#faf7f2}
    h1{font-size:20px} .card{background:#fff;border:1px solid #e7e1d6;border-radius:10px;padding:16px;margin:14px 0}
    .meta{color:#777;font-size:13px} textarea{width:100%;box-sizing:border-box;min-height:90px;font:inherit;padding:8px}
    button{font:inherit;padding:8px 14px;border-radius:8px;border:0;cursor:pointer;margin-right:8px}
    .send{background:#c96f4a;color:#fff} .skip{background:#eee}
    .empty{color:#999;text-align:center;padding:40px}
  </style>
  <h1>🎈 samarapix — messages needing you</h1>
  ${
    items.length === 0
      ? `<p class="empty">All caught up. 🎉</p>`
      : items
          .map(
            (i) => `<div class="card">
      <div class="meta">${i.category} · ${new Date(i.createdAt).toLocaleString()} · ${i.customer}</div>
      <p><b>Customer:</b> ${escapeHtml(i.incoming)}</p>
      <div class="meta">Why escalated: ${escapeHtml(i.reason)}</div>
      <form method="post" action="/send">
        <input type="hidden" name="id" value="${i.id}">
        <textarea name="reply">${escapeHtml(i.draft)}</textarea>
        <button class="send" type="submit">Approve &amp; send</button>
        <button class="skip" formaction="/dismiss" type="submit">Dismiss</button>
      </form>
    </div>`,
          )
          .join("")
  }`);
});

app.post("/send", async (req, res) => {
  const item = queue.get(req.body.id);
  if (item && item.status === "pending") {
    const reply = (req.body.reply || "").trim();
    try {
      await client.sendMessage(item.chatId, reply);
      remember(item.chatId, "assistant", reply);
      queue.update(item.id, { status: "sent", sentReply: reply, sentAt: new Date().toISOString() });
    } catch (err) {
      console.error("Send failed:", err.message);
    }
  }
  res.redirect("/");
});

app.post("/dismiss", (req, res) => {
  queue.update(req.body.id, { status: "dismissed" });
  res.redirect("/");
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Bind to localhost only — reach the dashboard from your laptop via an SSH
// tunnel (see README), never expose it directly to the internet.
app.listen(REVIEW_PORT, "127.0.0.1", () => {});

client.initialize();
