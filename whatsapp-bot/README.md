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

## Running on a headless Ubuntu server

No screen, no browser — so the two tricky parts are installing Chromium's
libraries and scanning the QR over SSH. Here's the whole flow.

### 1. Get the code + install everything

```bash
# on the server
git clone <your-repo-url> claude-test
cd claude-test/whatsapp-bot
bash deploy/setup-ubuntu.sh        # installs Node 22 + Chromium libs + npm deps
cp .env.example .env && nano .env  # add ANTHROPIC_API_KEY, OWNER_NUMBER, etc.
```

`setup-ubuntu.sh` installs the shared libraries headless Chromium needs (the
`libnss3` / `libgbm1` / `libatk` family) — without them Puppeteer fails to launch
with a cryptic "Failed to launch the browser process" error.

### 2. Scan the QR — once, in the foreground

```bash
npm start
```

The QR prints as text blocks right in your SSH terminal — scan it with the
phone (WhatsApp → Linked devices). The session saves to `.wwebjs_auth/`, so you
only do this once. Press `Ctrl+C` after you see `✅ WhatsApp connected`.

> If the QR looks mangled in your terminal, make the SSH window wider/zoom out —
> the block characters need room. PuTTY/Windows Terminal both render it fine.

### 3. Keep it running with systemd

So it survives crashes, logout, and reboots:

```bash
nano deploy/samarapix-bot.service        # set User= and WorkingDirectory= to match your server
sudo cp deploy/samarapix-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now samarapix-bot
journalctl -u samarapix-bot -f           # watch logs live
```

(Prefer `pm2`? `npm i -g pm2 && pm2 start src/index.js --name samarapix-bot && pm2 save && pm2 startup` works too.)

### 4. Approve escalations

**Easiest on a server: use Telegram** (see "Approvals in Telegram" below). You
approve from your phone with no tunnel and no open ports — ideal for a headless
box. Set `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` in `.env` and you're done.

If you'd rather use the web dashboard, it binds to `127.0.0.1` on the server (it
is **not** exposed to the internet). Open an SSH tunnel from your own machine:

```bash
ssh -N -L 3000:localhost:3000 youruser@your-server-ip
```

Then open `http://localhost:3000` in your laptop's browser. Approvals you click
there are sent through the bot running on the server.

### Notes for a server

- **Don't expose port 3000 publicly** and don't open it in the firewall — the SSH tunnel is the access path. (Anyone who reaches the dashboard can send messages as you.)
- The phone whose number you linked must stay online occasionally — WhatsApp Web sessions are tied to it.
- Keep `.env`, `.wwebjs_auth/`, and `review-queue.json` on the server only; they're already git-ignored.

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

## Approvals in Telegram (recommended)

Since you drive your server from Telegram, this is the nicest approval path —
no SSH tunnel, works from your phone.

**Set it up:**

1. On Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the **token**.
2. In `.env`, set `TELEGRAM_BOT_TOKEN=<token>` and leave `TELEGRAM_CHAT_ID` blank.
3. Start the bot (`npm start`), then **send your new bot any message** — it replies with your chat id.
4. Paste that id into `TELEGRAM_CHAT_ID` and restart.

**How you use it:** when the bot escalates, you get a Telegram message with the
customer's text and a suggested reply, plus two buttons:

- **✅ Send as-is** — sends the suggested reply to the customer.
- **🗑 Dismiss** — drops it (you'll handle it yourself).
- **Reply to the message** with your own text — sends *your* wording to the customer instead.

Only your configured chat id can approve. If Telegram is unset, escalations fall
back to a WhatsApp forward + the web dashboard below.

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
| `src/telegram.js` | Telegram escalation + approval (Send/Dismiss buttons, reply-to-correct). |
| `src/index.js` | WhatsApp client, message handler, escalation, review dashboard. |
| `src/queue.js` | File-backed review queue (`review-queue.json`). |

This is a prototype: history is kept in memory (resets on restart) and the queue
is a JSON file. Fine for testing; move to a database before relying on it.
