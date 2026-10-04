# Kakeibo

One screen for the current month. It runs in the browser and keeps its notes in memory. There is no account, no server, and no payment.

Open it from this folder:

```bash
npm start
```

Then visit `http://127.0.0.1:4173`.

```bash
npm test
```

## What the screen does

Type a line, or use Speak when the browser offers speech input. The amount is its own field. Spend or income comes from the words in the line:

- Spend: bought, spent, paid for
- Income: got, paid, salary, refund

`paid for` is spend. `paid` alone is income. If both kinds of words are present, the line stays unsaved until it says one or the other.

Pick a bucket: needs, wants, culture, or unexpected. The screen shows the direction, amount, and bucket, and nothing is written until Confirm.

The three spends that repeat most are chips. A chip fills the line and still waits for Confirm.

Month end shows what you meant to keep, what you kept, and the gap. Kept is income minus spend. The meant-to-keep figure starts at $2,500 and can be edited once. The screen then asks for one change.

The month is already seeded, so the chips, confirm, and gap are ready to use. Refreshing the page restores that seed.
