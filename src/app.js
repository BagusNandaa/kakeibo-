import {
  BUCKET_LABELS,
  MEANT_TO_KEEP_SEED,
  commitChange,
  commitMeantToKeep,
  entryFromConfirm,
  formatMoney,
  gapReport,
  monthTitle,
  monthTotals,
  parseAmount,
  parseMeant,
  previewCopy,
  seedEntries,
  topSpendChips,
} from "./ledger.js";

const state = {
  entries: seedEntries(),
  meantToKeep: MEANT_TO_KEEP_SEED,
  meantEditsUsed: 0,
  change: "",
};

const monthHeading = document.querySelector("#month-title");
const monthEnd = document.querySelector("#month-end");
const meantRead = document.querySelector("#meant-read");
const meantValue = document.querySelector("#meant-value");
const meantEdit = document.querySelector("#meant-edit");
const meantNote = document.querySelector("#meant-note");
const meantForm = document.querySelector("#meant-form");
const meantInput = document.querySelector("#meant-input");
const meantError = document.querySelector("#meant-error");
const meantCancel = document.querySelector("#meant-cancel");
const keptValue = document.querySelector("#kept-value");
const keptFormula = document.querySelector("#kept-formula");
const gapKicker = document.querySelector("#gap-kicker");
const gapFigure = document.querySelector("#gap-figure");
const gapSentence = document.querySelector("#gap-sentence");
const changeForm = document.querySelector("#change-form");
const changeInput = document.querySelector("#change");
const changeSaved = document.querySelector("#change-saved");
const chipsRoot = document.querySelector("#chips");
const entryForm = document.querySelector("#entry-form");
const lineInput = document.querySelector("#line");
const amountInput = document.querySelector("#amount");
const speakButton = document.querySelector("#speak");
const speakNote = document.querySelector("#speak-note");
const previewDirection = document.querySelector("#preview-direction");
const previewAmount = document.querySelector("#preview-amount");
const previewBucket = document.querySelector("#preview-bucket");
const previewSentence = document.querySelector("#preview-sentence");
const confirmButton = document.querySelector("#confirm");
const entriesRoot = document.querySelector("#entries");
const listTitle = document.querySelector("#list-title");
const status = document.querySelector("#status");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

monthHeading.textContent = monthTitle();

function selectedBucket() {
  const picked = entryForm.querySelector('input[name="bucket"]:checked');
  return picked ? picked.value : "";
}

function renderPreview() {
  const copy = previewCopy({
    line: lineInput.value,
    amount: parseAmount(amountInput.value),
    bucket: selectedBucket(),
  });
  previewDirection.textContent = copy.directionText;
  previewAmount.textContent = copy.amountText;
  previewBucket.textContent = copy.bucketText;
  previewSentence.textContent = copy.sentence;
  confirmButton.disabled = !copy.ready;
}

function renderGap() {
  const totals = monthTotals(state.entries);
  const gap = gapReport(state.meantToKeep, totals.kept);
  meantValue.textContent = formatMoney(state.meantToKeep);
  keptValue.textContent = formatMoney(totals.kept);
  keptFormula.textContent = `Kept is ${formatMoney(totals.income)} income minus ${formatMoney(totals.spend)} spend.`;
  gapKicker.textContent = gap.kicker;
  gapFigure.textContent = formatMoney(gap.gap);
  gapSentence.textContent = gap.sentence;
  monthEnd.classList.remove("short", "ahead", "even");
  monthEnd.classList.add(gap.tone);

  const locked = state.meantEditsUsed >= 1;
  meantEdit.hidden = locked;
  meantNote.textContent = locked
    ? "Edited once."
    : "You can edit this once.";

  if (state.change) {
    changeForm.hidden = true;
    changeSaved.hidden = false;
    changeSaved.textContent = `Your change: ${state.change}`;
  }
}

function renderChips() {
  const chips = topSpendChips(state.entries);
  chipsRoot.replaceChildren();
  if (!chips.length) {
    const empty = document.createElement("p");
    empty.className = "section-copy";
    empty.textContent = "No repeated spend yet.";
    chipsRoot.append(empty);
    return;
  }
  for (const chip of chips) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.setAttribute(
      "aria-label",
      `Fill the line with ${chip.label}. Repeated ${chip.count} times. Still needs confirm.`,
    );
    const label = document.createElement("span");
    label.textContent = chip.label;
    const count = document.createElement("span");
    count.className = "chip-count";
    count.textContent = String(chip.count);
    button.append(label, count);
    button.addEventListener("click", () => {
      lineInput.value = chip.label;
      renderPreview();
      amountInput.focus();
    });
    chipsRoot.append(button);
  }
}

function renderEntries() {
  const ordered = [...state.entries].sort((a, b) => b.at - a.at);
  listTitle.textContent = `This month · ${ordered.length}`;
  entriesRoot.replaceChildren();
  for (const entry of ordered) {
    const item = document.createElement("li");
    const text = document.createElement("div");
    const line = document.createElement("p");
    line.className = "entry-line";
    line.textContent = entry.line;
    const meta = document.createElement("p");
    meta.className = "entry-meta";
    const direction = entry.direction === "income" ? "Income" : "Spend";
    meta.textContent = `${direction} · ${BUCKET_LABELS[entry.bucket]}`;
    text.append(line, meta);
    const money = document.createElement("p");
    money.className = `entry-money ${entry.direction}`;
    money.textContent = formatMoney(entry.amount);
    item.append(text, money);
    entriesRoot.append(item);
  }
}

function openMeantEditor() {
  if (state.meantEditsUsed >= 1) return;
  meantInput.value = String(state.meantToKeep);
  meantError.hidden = true;
  meantError.textContent = "";
  meantRead.hidden = true;
  meantForm.hidden = false;
  meantInput.focus();
  meantInput.select();
}

function closeMeantEditor() {
  meantForm.hidden = true;
  meantRead.hidden = false;
}

meantEdit.addEventListener("click", openMeantEditor);
meantCancel.addEventListener("click", closeMeantEditor);

meantForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = commitMeantToKeep(
    state.meantEditsUsed,
    parseMeant(meantInput.value),
  );
  if (!result.ok) {
    meantError.hidden = false;
    meantError.textContent =
      result.reason === "once"
        ? "Meant to keep was already edited."
        : "Enter zero or more.";
    return;
  }
  state.meantToKeep = result.meantToKeep;
  state.meantEditsUsed = result.meantEditsUsed;
  closeMeantEditor();
  renderGap();
  status.textContent = `Meant to keep is now ${formatMoney(state.meantToKeep)}.`;
});

changeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = commitChange(state.change, changeInput.value);
  if (!result.ok) {
    changeInput.setAttribute("aria-invalid", "true");
    status.textContent = "Write the one change before saving it.";
    changeInput.focus();
    return;
  }
  state.change = result.change;
  changeInput.removeAttribute("aria-invalid");
  renderGap();
  status.textContent = `Saved your change: ${state.change}`;
});

entryForm.addEventListener("input", renderPreview);
entryForm.addEventListener("change", renderPreview);

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = entryFromConfirm({
    id: `e-${Date.now()}`,
    line: lineInput.value,
    amountRaw: amountInput.value,
    bucket: selectedBucket(),
  });
  if (!entry) {
    renderPreview();
    status.textContent = "Nothing was saved.";
    return;
  }
  state.entries.push(entry);
  lineInput.value = "";
  amountInput.value = "";
  for (const radio of entryForm.querySelectorAll('input[name="bucket"]')) {
    radio.checked = false;
  }
  if (recognition) recognition.stop();
  renderPreview();
  renderChips();
  renderGap();
  renderEntries();
  const direction = entry.direction === "income" ? "Income" : "Spend";
  status.textContent = `Saved ${direction} of ${formatMoney(entry.amount)} in ${BUCKET_LABELS[entry.bucket]}.`;
  lineInput.focus();
});

function setListening(listening) {
  speakButton.setAttribute("aria-pressed", listening ? "true" : "false");
  speakButton.textContent = listening ? "Stop" : "Speak";
  speakButton.classList.toggle("listening", listening);
}

if (!SpeechRecognition) {
  speakButton.disabled = true;
  speakNote.textContent = "Speech input is not available in this browser. Type the line.";
} else {
  speakButton.addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    const next = new SpeechRecognition();
    recognition = next;
    next.lang = "en-US";
    next.interimResults = true;
    next.continuous = false;
    next.onresult = (event) => {
      let heard = "";
      for (const result of event.results) {
        heard += result[0].transcript;
      }
      lineInput.value = heard.trim();
      renderPreview();
    };
    next.onerror = (event) => {
      if (event.error === "aborted") return;
      const messages = {
        "not-allowed": "The browser blocked the microphone. Type the line.",
        "no-speech": "No speech came through. Type the line.",
        "audio-capture": "No microphone was found. Type the line.",
        network: "Speech input could not reach this browser's speech service. Type the line.",
      };
      speakNote.textContent =
        messages[event.error] || "Speech input stopped. Type the line.";
    };
    next.onend = () => {
      recognition = null;
      setListening(false);
    };
    speakNote.textContent = "";
    setListening(true);
    try {
      next.start();
    } catch {
      recognition = null;
      setListening(false);
      speakNote.textContent = "Speech input is not available in this browser. Type the line.";
    }
  });
}

renderChips();
renderPreview();
renderGap();
renderEntries();
