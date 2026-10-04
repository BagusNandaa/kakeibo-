export const BUCKETS = ["needs", "wants", "culture", "unexpected"];

export const BUCKET_LABELS = {
  needs: "Needs",
  wants: "Wants",
  culture: "Culture",
  unexpected: "Unexpected",
};

export const SPEND_WORDS = ["bought", "spent", "paid for"];
export const INCOME_WORDS = ["got", "paid", "salary", "refund"];

export const MEANT_TO_KEEP_SEED = 2500;

const SPEND_PATTERNS = [
  ["paid for", /\bpaid\s+for\b/],
  ["bought", /\bbought\b/],
  ["spent", /\bspent\b/],
];

const INCOME_PATTERNS = [
  ["got", /\bgot\b/],
  ["salary", /\bsalary\b/],
  ["refund", /\brefund\b/],
  ["paid", /\bpaid\b/],
];

function cleanMoney(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/[$,]/g, "");
}

function toCents(raw) {
  const cleaned = cleanMoney(raw);
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(cents)) return null;
  return cents;
}

export function parseAmount(raw) {
  const cents = toCents(raw);
  if (cents === null || cents <= 0) return null;
  return cents / 100;
}

export function parseMeant(raw) {
  const cents = toCents(raw);
  if (cents === null || cents < 0) return null;
  return cents / 100;
}

export function classify(line) {
  const text = String(line ?? "").toLowerCase();
  const spend = SPEND_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([word]) => word,
  );
  const withoutPaidFor = text.replace(/\bpaid\s+for\b/g, " ");
  const income = INCOME_PATTERNS.filter(([, pattern]) =>
    pattern.test(withoutPaidFor),
  ).map(([word]) => word);

  let direction = "unclear";
  if (spend.length && !income.length) direction = "spend";
  if (income.length && !spend.length) direction = "income";

  return { direction, spend, income };
}

export function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function normalizeLine(line) {
  return String(line ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function previewCopy({ line, amount, bucket }) {
  const parsed = classify(line);
  const known =
    parsed.direction === "spend" || parsed.direction === "income";
  const bucketLabel = BUCKET_LABELS[bucket] ?? null;
  const directionLabel =
    parsed.direction === "spend"
      ? "Spend"
      : parsed.direction === "income"
        ? "Income"
        : "Unclear";
  const why = [...parsed.spend, ...parsed.income];
  const directionText = known
    ? `${directionLabel} · ${why.join(", ")}`
    : why.length
      ? `Unclear · ${why.join(", ")}`
      : "Not yet";

  const ready = known && amount !== null && amount !== undefined && Boolean(bucketLabel);

  let sentence = "Pick one bucket.";
  if (ready) {
    sentence = `${directionLabel} of ${formatMoney(amount)} in ${bucketLabel}.`;
  } else if (parsed.spend.length && parsed.income.length) {
    sentence = "Spend and income words are both here. Use one or the other.";
  } else if (!known) {
    sentence =
      "Add a spend word (bought, spent, paid for) or an income word (got, paid, salary, refund).";
  } else if (amount === null || amount === undefined) {
    sentence = "Enter the amount in its own field.";
  }

  return {
    ready,
    direction: parsed.direction,
    directionText,
    amountText:
      amount === null || amount === undefined ? "Not yet" : formatMoney(amount),
    bucketText: bucketLabel ?? "Not yet",
    sentence,
  };
}

export function entryFromConfirm({ line, amountRaw, bucket, at = Date.now(), id }) {
  const amount = parseAmount(amountRaw);
  const parsed = classify(line);
  const cleanLine = normalizeLine(line);
  if (!cleanLine) return null;
  if (amount === null) return null;
  if (!BUCKETS.includes(bucket)) return null;
  if (parsed.direction !== "spend" && parsed.direction !== "income") return null;
  return {
    id,
    line: cleanLine,
    amount,
    bucket,
    direction: parsed.direction,
    at,
  };
}

export function monthTotals(entries) {
  let incomeCents = 0;
  let spendCents = 0;
  for (const entry of entries) {
    const cents = Math.round(entry.amount * 100);
    if (entry.direction === "income") incomeCents += cents;
    if (entry.direction === "spend") spendCents += cents;
  }
  return {
    income: incomeCents / 100,
    spend: spendCents / 100,
    kept: (incomeCents - spendCents) / 100,
  };
}

export function gapReport(meant, kept) {
  const gapCents = Math.round(meant * 100) - Math.round(kept * 100);
  if (gapCents > 0) {
    const gap = gapCents / 100;
    return {
      tone: "short",
      gap,
      kicker: "Short",
      sentence: `The gap is ${formatMoney(gap)}. You kept less than you meant to keep.`,
    };
  }
  if (gapCents < 0) {
    const gap = Math.abs(gapCents) / 100;
    return {
      tone: "ahead",
      gap,
      kicker: "Ahead",
      sentence: `The gap is ${formatMoney(gap)}. You kept more than you meant to keep.`,
    };
  }
  return {
    tone: "even",
    gap: 0,
    kicker: "Even",
    sentence: "There is no gap. You kept what you meant to keep.",
  };
}

export function topSpendChips(entries, limit = 3) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.direction !== "spend") continue;
    const key = normalizeLine(entry.line).toLowerCase();
    if (!key) continue;
    const label = normalizeLine(entry.line);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { key, label, count: 1, latest: entry.at });
    } else {
      current.count += 1;
      if (entry.at >= current.latest) {
        current.latest = entry.at;
        current.label = label;
      }
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.latest - a.latest ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}

export function commitMeantToKeep(meantEditsUsed, nextAmount) {
  if (meantEditsUsed >= 1) return { ok: false, reason: "once" };
  if (nextAmount === null || nextAmount < 0) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, meantToKeep: nextAmount, meantEditsUsed: 1 };
}

export function commitChange(existing, text) {
  if (existing) return { ok: false, reason: "once" };
  const change = normalizeLine(text);
  if (!change) return { ok: false, reason: "empty" };
  return { ok: true, change };
}

export function monthTitle(now = new Date()) {
  return now.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function seedEntries(now = new Date()) {
  const rows = [
    ["s1", "Got salary", 3000, "needs"],
    ["s2", "Bought coffee", 6, "wants"],
    ["s3", "Bought groceries", 90, "needs"],
    ["s4", "Spent on lunch", 15, "wants"],
    ["s5", "Bought coffee", 6, "wants"],
    ["s6", "Bought groceries", 90, "needs"],
    ["s7", "Spent on lunch", 15, "wants"],
    ["s8", "Bought a train ticket", 12, "needs"],
    ["s9", "Bought coffee", 6, "wants"],
    ["s10", "Bought a book", 24, "culture"],
    ["s11", "Spent at the clinic", 180, "unexpected"],
    ["s12", "Bought groceries", 90, "needs"],
    ["s13", "Spent on lunch", 15, "wants"],
    ["s14", "Bought coffee", 6, "wants"],
    ["s15", "Got a refund", 40, "unexpected"],
    ["s16", "Bought groceries", 90, "needs"],
    ["s17", "Bought coffee", 6, "wants"],
    ["s18", "Spent on lunch", 15, "wants"],
    ["s19", "Bought coffee", 6, "wants"],
  ];
  const nowMs = now.getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const latest = nowMs - 1;
  const start = Math.min(monthStart, latest);
  const span = Math.max(latest - start, 0);

  return rows.map(([id, line, amount, bucket], index) => ({
    id,
    line,
    amount,
    bucket,
    direction: classify(line).direction,
    at: start + Math.floor((span * index) / (rows.length - 1)),
  }));
}
