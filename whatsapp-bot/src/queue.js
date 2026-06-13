// A dead-simple file-backed review queue for escalated messages.
// Good enough for a prototype; swap for SQLite/Postgres when you outgrow it.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, "..", "review-queue.json");

function load() {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function save(items) {
  writeFileSync(FILE, JSON.stringify(items, null, 2));
}

/** Add an item needing the owner's attention. Returns the created item. */
export function enqueue({ chatId, customer, incoming, draft, reason, category }) {
  const items = load();
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    chatId,
    customer,
    incoming,
    draft,
    reason,
    category,
    status: "pending", // pending | sent | dismissed
    createdAt: new Date().toISOString(),
  };
  items.push(item);
  save(items);
  return item;
}

export function pending() {
  return load().filter((i) => i.status === "pending");
}

export function get(id) {
  return load().find((i) => i.id === id);
}

export function update(id, patch) {
  const items = load();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  save(items);
  return items[idx];
}
