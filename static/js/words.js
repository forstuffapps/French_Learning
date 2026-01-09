// js/words.js

// ----- State -----
const DATA = window.DATA; // from words-data.js

const setBar = document.getElementById("setBar");
const sectionBar = document.getElementById("sectionBar");
const wordList = document.getElementById("wordList");

// Optional controls (may be null if HTML not updated yet)
const btnPlayAll = document.getElementById("btnPlayAll");
const btnStop = document.getElementById("btnStop");

// Defaults: first available set/section
const firstSet = Object.keys(DATA)[0];
const savedSet = localStorage.getItem("currentSet") || firstSet;
let currentSet = DATA[savedSet] ? savedSet : firstSet;

const firstSectionForSet = Object.keys(DATA[currentSet])[0];
const savedSection = localStorage.getItem("currentSection") || firstSectionForSet;
let currentSection =
  (DATA[currentSet] && DATA[currentSet][savedSection])
    ? savedSection
    : firstSectionForSet;

// Play-all control flag
let stopAllRequested = false;

// ----- Render helpers -----
function renderSets() {
  setBar.innerHTML = "";
  Object.keys(DATA).forEach(setName => {
    const isActive = setName === currentSet;   
  const btn = document.createElement("button");
    btn.className = `btn set-btn ${isActive ? "active" : ""}`;
    btn.textContent = setName.toUpperCase();
    btn.onclick = () => {
      currentSet = setName;
      currentSection = Object.keys(DATA[currentSet])[0];

      localStorage.setItem("currentSet", currentSet);
      localStorage.setItem("currentSection", currentSection);

      renderSets();
      renderSections();
      renderWords();
    };
    setBar.appendChild(btn);
  });
}

function renderSections() {
  sectionBar.innerHTML = "";
  Object.keys(DATA[currentSet]).forEach(secName => {
    const isActive = secName === currentSection;
    const btn = document.createElement("button");
    btn.className = `btn section-btn ${isActive ? "active" : ""}`;    // Show the actual category name (from your text file)
    btn.textContent = secName;
    btn.onclick = () => {
      currentSection = secName;
      localStorage.setItem("currentSection", currentSection);
      renderSections();
      renderWords();
    };
    sectionBar.appendChild(btn);
  });
}

function renderWords() {
  wordList.innerHTML = "";
  const pairs = DATA[currentSet][currentSection];

  pairs.forEach((pair, idx) => {
    const [fr, en] = pair;

    const row = document.createElement("div");
    row.className = "word-row";

    // number
    const num = document.createElement("div");
    num.className = "text-muted";
    num.style.width = "2ch";
    num.textContent = (idx + 1) + ".";
    row.appendChild(num);

    // French (click to speak)
    const frBtn = document.createElement("button");
    frBtn.className = "speak";
    frBtn.type = "button";
    frBtn.dataset.text = fr;
    frBtn.innerHTML = `${fr} <span class="icon">🔊</span>`;
    frBtn.addEventListener("click", () => playFrench(fr, row, frBtn, { debounce: true }));
    row.appendChild(frBtn);

    // arrow
    const arrow = document.createElement("div");
    arrow.className = "arrow";
    arrow.textContent = "→";
    row.appendChild(arrow);

    // English
    const enSpan = document.createElement("div");
    enSpan.textContent = en;
    row.appendChild(enSpan);

    wordList.appendChild(row);
  });
}

// ====== Free TTS via Google Translate + caching + UI state ======
const TTS_BASE = "https://translate.google.com/translate_tts";
const TTS_LANG = "fr";
const TTS_CLIENT = "tw-ob";
const MAX_CHARS = 180;

let currentAudio = null;
let currentRow = null;
let currentBtn = null;
const audioCache = new Map();

function normalizeKey(s) {
  return s
    .replaceAll("\u2019", "'")
    .replaceAll("\u00A0", " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

let tapLock = false;
function debounceTap(ms = 250) {
  if (tapLock) return true;
  tapLock = true;
  setTimeout(() => (tapLock = false), ms);
  return false;
}

function setPlayingUI(row, btn, isPlaying) {
  if (!row || !btn) return;
  row.classList.toggle("is-playing", isPlaying);
  btn.setAttribute("aria-pressed", String(isPlaying));
  const icon = btn.querySelector(".icon");
  if (icon) icon.textContent = isPlaying ? "⏸️" : "🔊";
}

function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  setPlayingUI(currentRow, currentBtn, false);
  currentRow = null;
  currentBtn = null;
}

function chunkText(text, maxLen = MAX_CHARS) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let start = 0;
  while (start < text.length) {
    parts.push(text.slice(start, start + maxLen));
    start += maxLen;
  }
  return parts;
}

async function fetchTTSBlob(text) {
  const url = `${TTS_BASE}?ie=UTF-8&client=${encodeURIComponent(TTS_CLIENT)}&tl=${encodeURIComponent(TTS_LANG)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("TTS HTTP " + res.status);
  return await res.blob();
}

async function getAudioURLFor(text) {
  const key = normalizeKey(text);
  if (audioCache.has(key)) return audioCache.get(key);

  const chunks = chunkText(key);
  if (chunks.length === 1) {
    const blob = await fetchTTSBlob(chunks[0]);
    const url = URL.createObjectURL(blob);
    audioCache.set(key, url);
    return url;
  } else {
    return { sequenced: chunks };
  }
}

function playSequentially(parts, row, btn, onDone) {
  let index = 0;

  const playNext = () => {
    if (stopAllRequested) {
      stopCurrent();
      onDone?.();
      return;
    }

    if (index >= parts.length) {
      stopCurrent();
      onDone?.();
      return;
    }

    fetchTTSBlob(parts[index++])
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onended = playNext;
        audio.onerror = () => {
          stopCurrent();
          onDone?.();
        };

        audio.play().catch(() => {
          stopCurrent();
          onDone?.();
        });
      })
      .catch(() => {
        stopCurrent();
        onDone?.();
      });
  };

  playNext();
}

function tryWebSpeechFallback(text) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  const fr = speechSynthesis.getVoices().find(v => /fr(-|_|$)/i.test(v.lang));
  if (fr) utter.voice = fr;
  utter.lang = (fr && fr.lang) || "fr-FR";
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/**
 * Plays French audio for `text`.
 * Returns a Promise that resolves when playback finishes (useful for Play All).
 */
async function playFrench(text, row, btn, opts = {}) {
  const shouldDebounce = opts.debounce !== false;
  if (shouldDebounce && debounceTap()) return;

  try {
    stopCurrent();

    currentRow = row;
    currentBtn = btn;
    setPlayingUI(currentRow, currentBtn, true);

    const audioURL = await getAudioURLFor(text);

    if (typeof audioURL === "string") {
      const audio = new Audio(audioURL);
      currentAudio = audio;

      return await new Promise((resolve) => {
        audio.onended = () => { stopCurrent(); resolve(); };
        audio.onerror = () => {
          stopCurrent();
          tryWebSpeechFallback(text);
          resolve();
        };
        audio.play().catch(() => { stopCurrent(); resolve(); });
      });
    }

    if (audioURL && audioURL.sequenced) {
      return await new Promise((resolve) => {
        playSequentially(audioURL.sequenced, row, btn, resolve);
      });
    }

    stopCurrent();
    tryWebSpeechFallback(text);
  } catch (err) {
    console.warn("TTS error:", err);
    stopCurrent();
    tryWebSpeechFallback(text);
  }
}

// ----- Play All / Stop wiring -----
async function playAllInCurrentSection() {
  stopAllRequested = false;

  const pairs = DATA[currentSet][currentSection];
  const rows = Array.from(document.querySelectorAll("#wordList .word-row"));

  for (let i = 0; i < pairs.length; i++) {
    if (stopAllRequested) break;

    const [fr] = pairs[i];
    const row = rows[i] || null;
    const btn = row ? row.querySelector(".speak") : null;

    // Await each word finishing before moving to next
    await playFrench(fr, row, btn, { debounce: false });
  }

  stopAllRequested = false;
}

function stopAll() {
  stopAllRequested = true;
  stopCurrent();
}

if (btnPlayAll) btnPlayAll.addEventListener("click", playAllInCurrentSection);
if (btnStop) btnStop.addEventListener("click", stopAll);

// ----- Init -----
renderSets();
renderSections();
renderWords();
