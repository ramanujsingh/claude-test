// Telegram escalation + approval channel.
//
// When the bot escalates, it posts the customer message + a suggested reply to
// your Telegram with [Send as-is] / [Dismiss] buttons. Tap "Send as-is" to send
// the draft, or REPLY to that Telegram message with your own wording to send a
// correction. Uses long-polling (works behind any firewall) and Node's built-in
// fetch — no extra npm dependency.
//
// Setup: create a bot with @BotFather → get the token. Run with the token set
// but TELEGRAM_CHAT_ID empty, send the bot any message, and it replies with your
// chat id; put that in .env and restart.

import * as queue from "./queue.js";

export function createTelegram({ botToken, chatId, onSend }) {
  const base = `https://api.telegram.org/bot${botToken}`;
  const hasChat = Boolean(chatId);
  let offset = 0;

  async function tg(method, body) {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`${method}: ${data.description}`);
    return data.result;
  }

  // Post an escalation to Telegram. Returns the message_id (store it so replies
  // can be mapped back to this queue item). No-op if chat id isn't configured.
  async function notify(item) {
    if (!hasChat) return null;
    const text =
      `🔔 Needs you (${item.category})\n` +
      `From: ${item.customer}\n\n` +
      `Customer said:\n${item.incoming}\n\n` +
      `Why escalated: ${item.reason}\n\n` +
      `Suggested reply:\n${item.draft}\n\n` +
      `Tap “Send as-is”, or reply to this message with your own wording.`;
    const msg = await tg("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Send as-is", callback_data: `send:${item.id}` },
            { text: "🗑 Dismiss", callback_data: `dismiss:${item.id}` },
          ],
        ],
      },
    });
    return msg.message_id;
  }

  function fromOwner(id) {
    // During setup (no chat id yet) accept anyone so they can discover their id.
    return !hasChat || String(id) === String(chatId);
  }

  async function deliver(item, text, originMessageId) {
    const ok = await onSend(item, text); // index.js sends via WhatsApp
    queue.update(item.id, ok ? { status: "sent", sentReply: text, sentAt: new Date().toISOString() } : {});
    if (originMessageId) {
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: originMessageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
    await tg("sendMessage", { chat_id: chatId, text: ok ? `✅ Sent to ${item.customer}.` : `⚠️ Failed to send — check the bot logs.` }).catch(() => {});
  }

  async function handleCallback(cq) {
    const from = cq.from?.id;
    await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
    if (!fromOwner(from)) return;
    const [action, id] = (cq.data || "").split(":");
    const item = queue.get(id);
    if (!item || item.status !== "pending") {
      await tg("sendMessage", { chat_id: chatId, text: "That one's already handled." }).catch(() => {});
      return;
    }
    if (action === "send") {
      await deliver(item, item.draft, cq.message?.message_id);
    } else if (action === "dismiss") {
      queue.update(id, { status: "dismissed" });
      await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: cq.message?.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      await tg("sendMessage", { chat_id: chatId, text: "🗑 Dismissed." }).catch(() => {});
    }
  }

  async function handleMessage(m) {
    const text = (m.text || "").trim();
    // Setup helper: reveal the chat id.
    if (!hasChat || text === "/id" || text === "/start") {
      await tg("sendMessage", {
        chat_id: m.chat.id,
        text: hasChat
          ? `This chat's id is ${m.chat.id}.`
          : `Your chat id is ${m.chat.id}.\nPut it in TELEGRAM_CHAT_ID in .env and restart the bot.`,
      }).catch(() => {});
      return;
    }
    if (!fromOwner(m.from?.id)) return;

    // A reply to an escalation message = the owner's corrected wording.
    const replyTo = m.reply_to_message?.message_id;
    if (replyTo && text) {
      const item = queue.pending().find((i) => i.telegramMessageId === replyTo);
      if (item) {
        await deliver(item, text, replyTo);
      } else {
        await tg("sendMessage", { chat_id: chatId, text: "Couldn't match that to a pending message (maybe already handled)." }).catch(() => {});
      }
    }
  }

  async function poll() {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message", "callback_query"] });
      for (const u of updates) {
        offset = u.update_id + 1;
        if (u.callback_query) await handleCallback(u.callback_query);
        else if (u.message) await handleMessage(u.message);
      }
    } catch (err) {
      console.error("Telegram poll error:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
    setImmediate(poll);
  }

  function start() {
    console.log(hasChat ? "✅ Telegram approvals active." : "⚠️ Telegram running in setup mode — message the bot to get your chat id.");
    poll();
  }

  return { notify, start };
}
