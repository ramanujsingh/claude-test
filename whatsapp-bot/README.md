# samarapix WhatsApp auto-reply bot (prototype)

A Claude-powered front desk for WhatsApp. When a customer messages your number,
Claude reads it, and either:

- **answers automatically** (simple FAQs — packages, hours, how booking works), or
- **escalates to you** (custom quotes, complaints, date/payment, anything it isn't sure about) — it forwards the message to your WhatsApp and queues a draft reply for you to approve.

It only ever responds to people who message **you** (inbound). It does not send bulk or unsolicited messages.

---

## ⚠️ Read this first — ban risk

This uses [`whatsapp-web.js`](https://wwebjs.dev/), which logs in as your number
through WhatsApp Web. **This is against WhatsApp's Terms of Service, and WhatsApp
can ban the number.** For a real business that depends on these chats, the
compliant path is the official WhatsApp Business Platform (Cloud API) — see the
chat where we discussed this.

If you proceed anyway:

- **Use a spare / secondary number first.** Do not start on your main client line.
- Keep replies human and conversational. Spammy, identical, high-volume sending is the fastest way to get banned.
- Start in **approval mode** (`APPROVAL_MODE=true`) so nothing is sent without you clicking "approve".

---

## Setup

Requires Node 18+ (Node 22 recommended) and a Chromium that Puppeteer can use.

```bash
cd whatsapp-bot
npm install
cp .env.example .env      # then edit .env
npm start
```

On first run a **QR code** prints in the terminal. Open WhatsApp on the phone
holding the number → **Settings → Linked devices → Link a device** → scan it.
The session is saved in `.wwebjs_auth/`, so you only scan once.

When it's connected you'll see the review dashboard URL (default
`http://localhost:3000`).

---

## How it decides

`src/business.js` is the **single source of truth** — packages, prices, hours,
policies, and a list of topics that must always go to you. Claude is instructed
to answer **only** from this file and to escalate anything it can't cover.
The more accurate and specific you make `business.js`, the more it can handle on
its own. **It will never invent a price or promise a date.**

Tuning knobs (in `.env`):

| Setting | What it does |
|---|---|
| `APPROVAL_MODE=true` | Nothing is auto-sent — every reply is drafted and waits for your approval. Best for week one. |
| `APPROVAL_MODE=false` | Confident answers are auto-sent; only uncertain/sensitive ones escalate. |
| `CONFIDENCE_THRESHOLD` | 0–1. Below this, the bot escalates even if it wanted to auto-reply. |
| `CLAUDE_MODEL` | Defaults to `claude-opus-4-8`. For high volume, `claude-haiku-4-5` or `claude-sonnet-4-6` are cheaper/faster. |

---

## The review dashboard

Open the dashboard URL. Escalated messages appear as cards with the customer's
message, why it was escalated, and an editable draft reply. Click **Approve &
send** to send it through your WhatsApp (edit first if you like), or **Dismiss**.
You also get a copy of every escalation forwarded to your own WhatsApp number.

---

## Files

| File | Purpose |
|---|---|
| `src/business.js` | Your packages, prices, policies, escalation rules. **Edit this.** |
| `src/claude.js` | Builds the prompt + structured-output schema; returns the decision. |
| `src/index.js` | WhatsApp client, message handler, escalation, review dashboard. |
| `src/queue.js` | File-backed review queue (`review-queue.json`). |

This is a prototype: history is kept in memory (resets on restart) and the queue
is a JSON file. Fine for testing; move to a database before relying on it.
