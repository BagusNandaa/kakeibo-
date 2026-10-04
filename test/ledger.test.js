import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INCOME_WORDS,
  MEANT_TO_KEEP_SEED,
  SPEND_WORDS,
  classify,
  commitChange,
  commitMeantToKeep,
  entryFromConfirm,
  gapReport,
  monthTotals,
  parseAmount,
  previewCopy,
  seedEntries,
  topSpendChips,
} from "../src/ledger.js";

describe("classify", () => {
  it("reads the income words", () => {
    for (const word of INCOME_WORDS) {
      assert.equal(classify(`I ${word} today`).direction, "income", word);
    }
  });

  it("reads the spend words", () => {
    for (const word of SPEND_WORDS) {
      assert.equal(classify(`I ${word} lunch`).direction, "spend", word);
    }
  });

  it("treats paid for as spend, and paid alone as income", () => {
    assert.deepEqual(classify("Paid for groceries"), {
      direction: "spend",
      spend: ["paid for"],
      income: [],
    });
    assert.equal(classify("I got paid").direction, "income");
    assert.deepEqual(classify("I got paid").income, ["got", "paid"]);
    assert.equal(classify("paid.").direction, "income");
  });

  it("stays unclear when both sides match, or neither does", () => {
    const mixed = classify("Bought a refund");
    assert.equal(mixed.direction, "unclear");
    assert.deepEqual(mixed.spend, ["bought"]);
    assert.deepEqual(mixed.income, ["refund"]);
    assert.equal(classify("Coffee").direction, "unclear");
    assert.equal(classify("   ").direction, "unclear");
  });

  it("does not take the amount from the sentence", () => {
    const parsed = classify("Bought coffee 80");
    assert.equal(parsed.direction, "spend");
    assert.equal("amount" in parsed, false);
  });
});

describe("confirm", () => {
  it("builds an entry only when direction, amount, and bucket are all set", () => {
    const saved = entryFromConfirm({
      id: "n1",
      line: "  Bought   coffee 80 ",
      amountRaw: "$6.00",
      bucket: "wants",
      at: 10,
    });
    assert.deepEqual(saved, {
      id: "n1",
      line: "Bought coffee 80",
      amount: 6,
      bucket: "wants",
      direction: "spend",
      at: 10,
    });
    assert.equal(
      entryFromConfirm({
        id: "n2",
        line: "Bought coffee 80",
        amountRaw: "",
        bucket: "wants",
      }),
      null,
    );
    assert.equal(
      entryFromConfirm({
        id: "n3",
        line: "Coffee",
        amountRaw: "4",
        bucket: "wants",
      }),
      null,
    );
    assert.equal(
      entryFromConfirm({
        id: "n4",
        line: "Bought coffee",
        amountRaw: "4",
        bucket: "",
      }),
      null,
    );
  });

  it("rejects a zero or blank amount", () => {
    assert.equal(parseAmount(""), null);
    assert.equal(parseAmount("0"), null);
    assert.equal(parseAmount("-5"), null);
    assert.equal(parseAmount("12.50"), 12.5);
  });
});

describe("preview", () => {
  it("names direction, amount, and bucket before confirm is allowed", () => {
    const ready = previewCopy({
      line: "Paid for groceries",
      amount: 12,
      bucket: "needs",
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.directionText, "Spend · paid for");
    assert.equal(ready.amountText, "$12.00");
    assert.equal(ready.bucketText, "Needs");
    assert.equal(ready.sentence, "Spend of $12.00 in Needs.");

    const missingAmount = previewCopy({
      line: "Got salary",
      amount: null,
      bucket: "needs",
    });
    assert.equal(missingAmount.ready, false);
    assert.equal(missingAmount.directionText, "Income · got, salary");
    assert.match(missingAmount.sentence, /amount/i);
  });
});

describe("month", () => {
  const entries = seedEntries(new Date(2026, 9, 4, 12));

  it("seeds a month with repeated spends and a gap", () => {
    for (const entry of entries) {
      assert.equal(entry.direction, classify(entry.line).direction);
      assert.notEqual(entry.direction, "unclear");
    }
    const totals = monthTotals(entries);
    assert.equal(totals.income, 3040);
    assert.equal(totals.spend, 672);
    assert.equal(totals.kept, 2368);
    const gap = gapReport(MEANT_TO_KEEP_SEED, totals.kept);
    assert.equal(gap.tone, "short");
    assert.equal(gap.gap, 132);
    assert.match(gap.sentence, /\$132\.00/);
  });

  it("turns the three most repeated spends into chips", () => {
    assert.deepEqual(
      topSpendChips(entries).map((chip) => [chip.label, chip.count]),
      [
        ["Bought coffee", 6],
        ["Spent on lunch", 4],
        ["Bought groceries", 4],
      ],
    );
  });

  it("ignores repeated income when choosing chips", () => {
    const salary = Array.from({ length: 8 }, (_, index) => ({
      id: `i${index}`,
      line: "Got salary",
      amount: 100,
      bucket: "needs",
      direction: "income",
      at: index,
    }));
    const chips = topSpendChips([
      ...salary,
      {
        id: "a",
        line: "Bought soap",
        amount: 3,
        bucket: "needs",
        direction: "spend",
        at: 1,
      },
    ]);
    assert.deepEqual(
      chips.map((chip) => chip.label),
      ["Bought soap"],
    );
  });

  it("lets meant-to-keep change once, and asks for one change", () => {
    const first = commitMeantToKeep(0, 2600);
    assert.equal(first.ok, true);
    assert.equal(commitMeantToKeep(first.meantEditsUsed, 2700).ok, false);
    assert.equal(commitMeantToKeep(0, -1).ok, false);

    const change = commitChange("", "  Pack   lunch  ");
    assert.deepEqual(change, { ok: true, change: "Pack lunch" });
    assert.equal(commitChange(change.change, "Something else").ok, false);
    assert.equal(commitChange("", "   ").ok, false);
  });

  it("describes a surplus as ahead", () => {
    const gap = gapReport(100, 140);
    assert.equal(gap.tone, "ahead");
    assert.equal(gap.gap, 40);
  });

  it("keeps seeded lines earlier than now, so a new line sorts first", () => {
    const now = new Date(2026, 9, 4, 15, 30, 0);
    const seeded = seedEntries(now);
    assert.ok(seeded.every((entry) => entry.at < now.getTime()));
    const added = {
      id: "new",
      line: "Bought coffee",
      amount: 7.5,
      bucket: "wants",
      direction: "spend",
      at: now.getTime(),
    };
    const ordered = [...seeded, added].sort((a, b) => b.at - a.at);
    assert.equal(ordered[0].id, "new");
  });
});
