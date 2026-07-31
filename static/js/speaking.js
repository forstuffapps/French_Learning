const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const setupArea = document.getElementById("setupArea");
const quizArea = document.getElementById("quizArea");
const resultArea = document.getElementById("resultArea");
const unsupportedMessage = document.getElementById("unsupportedMessage");
const setPicker = document.getElementById("setPicker");
const questionCountEl = document.getElementById("questionCount");
const questionText = document.getElementById("questionText");
const metaText = document.getElementById("metaText");
const progressPill = document.getElementById("progressPill");
const scorePill = document.getElementById("scorePill");
const statusText = document.getElementById("statusText");
const btnSpeak = document.getElementById("btnSpeak");
const feedbackArea = document.getElementById("feedbackArea");
const feedbackText = document.getElementById("feedbackText");
const heardText = document.getElementById("heardText");
const listeningAnimation = document.getElementById("listeningAnimation");

const FRENCH_NUMBERS = {
  0: "zero", 1: "un", 2: "deux", 3: "trois", 4: "quatre", 5: "cinq",
  6: "six", 7: "sept", 8: "huit", 9: "neuf", 10: "dix", 11: "onze",
  12: "douze", 13: "treize", 14: "quatorze", 15: "quinze", 16: "seize",
  17: "dix sept", 18: "dix huit", 19: "dix neuf", 20: "vingt",
  30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante",
  70: "soixante dix", 80: "quatre vingts", 90: "quatre vingt dix",
  100: "cent", 1000: "mille"
};

let questions = [];
let qIndex = 0;
let score = 0;
let recognition = null;
let isRecognitionRunning = false;
let isCapturing = false;
let isAwaitingResult = false;
let capturedTranscript = "";
let releaseTimer = null;
let quizActive = false;

function shuffle(items) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function normalize(text) {
  return text.toLocaleLowerCase("fr-FR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, number => FRENCH_NUMBERS[number] || number)
    .replace(/[\u2019']/g, " ").replace(/-/g, " ")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesTarget(spoken, target) {
  const spokenValue = normalize(spoken);
  return target.split(/\s*\/\s*/).some(option => normalize(option) === spokenValue);
}

function flattenData(selectedSets) {
  const items = [];
  selectedSets.forEach(setName => {
    Object.entries(window.DATA[setName] || {}).forEach(([sectionName, pairs]) => {
      pairs.forEach(([fr, en]) => {
        // Skip vocabulary entries with damaged source characters. They cannot be
        // shown, spoken, or matched reliably until the source data is repaired.
        if (!fr.includes("\uFFFD")) items.push({ fr, en, setName, sectionName });
      });
    });
  });
  return items;
}

function getSelectedSets() {
  return Array.from(document.querySelectorAll(".speaking-set-input:checked"), input => input.value);
}

function saveSelectedSets() {
  localStorage.setItem("speakingSelectedSets", JSON.stringify(getSelectedSets()));
}

function renderSetPicker() {
  const setNames = Object.keys(window.DATA || {});
  const saved = JSON.parse(localStorage.getItem("speakingSelectedSets") || "[]");
  const selected = saved.length ? saved : setNames;
  setPicker.innerHTML = "";
  setNames.forEach(setName => {
    const id = `speaking-set-${setName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
    const wrapper = document.createElement("div");
    wrapper.className = "form-check practice-set-option";
    wrapper.innerHTML = `<input class="form-check-input speaking-set-input" type="checkbox" value="${setName}" id="${id}"><label class="form-check-label" for="${id}">${setName}</label>`;
    const input = wrapper.querySelector("input");
    input.checked = selected.includes(setName);
    input.addEventListener("change", saveSelectedSets);
    setPicker.appendChild(wrapper);
  });
}

function setListening(value) {
  listeningAnimation.classList.toggle("d-none", !value);
}

function speakCorrectAnswer() {
  const target = questions[qIndex]?.fr;
  if (!target || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(target.split(/\s*\/\s*/)[0]);
  utterance.lang = "fr-FR";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function renderQuestion() {
  const question = questions[qIndex];
  progressPill.textContent = `Q ${qIndex + 1}/${questions.length}`;
  scorePill.textContent = `Score: ${score}`;
  questionText.textContent = question.fr;
  metaText.textContent = `${question.setName} • ${question.sectionName}`;
  statusText.textContent = "Hold the button while you say the word.";
  btnSpeak.disabled = false;
  btnSpeak.textContent = "Hold to speak";
  feedbackArea.classList.add("d-none");
  isCapturing = false;
  isAwaitingResult = false;
  capturedTranscript = "";
  clearTimeout(releaseTimer);
  setListening(false);
}

function showFeedback(spokenText) {
  const correct = matchesTarget(spokenText, questions[qIndex].fr);
  if (correct) score++;
  scorePill.textContent = `Score: ${score}`;
  feedbackText.textContent = correct ? "Correct — well done!" : "Not quite. Try to say the word shown.";
  feedbackText.className = `fw-semibold mb-2 ${correct ? "text-success" : "text-danger"}`;
  heardText.textContent = `We heard: “${spokenText}”`;
  statusText.textContent = "The correct pronunciation is now playing.";
  feedbackArea.classList.remove("d-none");
  btnSpeak.disabled = true;
  isCapturing = false;
  isAwaitingResult = false;
  clearTimeout(releaseTimer);
  setListening(false);
  speakCorrectAnswer();
}

function describeError(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "Microphone access was blocked. Allow it in browser settings and try again.";
  if (error === "no-speech") return "No speech was detected. Hold the button and try again.";
  if (error === "network") return "Speech recognition needs an internet connection. Please check yours and try again.";
  return "Speech recognition could not complete. Please try again.";
}

function startRecognitionSession() {
  if (isRecognitionRunning || !quizActive) return;
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { isRecognitionRunning = true; };
    recognition.onresult = resultEvent => {
      if (!isCapturing && !isAwaitingResult) return;
      capturedTranscript = resultEvent.results[resultEvent.results.length - 1][0].transcript;
      if (isAwaitingResult) {
        isAwaitingResult = false;
        clearTimeout(releaseTimer);
        showFeedback(capturedTranscript);
      }
    };
    recognition.onerror = errorEvent => {
      if (errorEvent.error === "aborted") return;
      isRecognitionRunning = false;
      if (isCapturing || isAwaitingResult) {
        isCapturing = false;
        isAwaitingResult = false;
        clearTimeout(releaseTimer);
        setListening(false);
        statusText.textContent = describeError(errorEvent.error);
        btnSpeak.disabled = false;
        btnSpeak.textContent = "Hold to speak";
      }
    };
    recognition.onend = () => {
      isRecognitionRunning = false;
      if (quizActive) window.setTimeout(startRecognitionSession, 150);
    };
  }
  try { recognition.start(); } catch { /* session is still closing; onend will retry */ }
}

function beginSpeaking(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (btnSpeak.disabled) return;
  event.preventDefault();
  startRecognitionSession();
  isCapturing = true;
  isAwaitingResult = false;
  capturedTranscript = "";
  clearTimeout(releaseTimer);
  btnSpeak.textContent = "Listening… release when finished";
  statusText.textContent = "Keep holding the button while you say the word.";
  setListening(true);
  btnSpeak.setPointerCapture?.(event.pointerId);
}

function stopSpeaking(event) {
  if (!isCapturing) return;
  event.preventDefault();
  isCapturing = false;
  isAwaitingResult = true;
  btnSpeak.releasePointerCapture?.(event.pointerId);
  btnSpeak.textContent = "Checking…";
  statusText.textContent = "Checking what we heard…";
  setListening(false);
  if (capturedTranscript) {
    isAwaitingResult = false;
    return showFeedback(capturedTranscript);
  }
  releaseTimer = window.setTimeout(() => {
    if (!isAwaitingResult) return;
    isAwaitingResult = false;
    if (capturedTranscript) showFeedback(capturedTranscript);
    else {
      statusText.textContent = "No speech was detected. Hold the button and try again.";
      btnSpeak.disabled = false;
      btnSpeak.textContent = "Hold to speak";
    }
  }, 1000);
}

function cancelSpeaking(event) {
  if (!isCapturing) return;
  event.preventDefault();
  isCapturing = false;
  isAwaitingResult = false;
  capturedTranscript = "";
  clearTimeout(releaseTimer);
  setListening(false);
  statusText.textContent = "Hold the button while you say the word.";
  btnSpeak.textContent = "Hold to speak";
}

function startQuiz() {
  const selectedSets = getSelectedSets();
  if (!selectedSets.length) return alert("Select at least one vocabulary set.");
  const items = flattenData(selectedSets);
  if (!items.length) return alert("There are no words in the selected sets.");
  quizActive = true;
  startRecognitionSession();
  window.speechSynthesis?.cancel();
  const count = Number.parseInt(questionCountEl.value, 10) || 10;
  questions = shuffle(items).slice(0, Math.min(count, items.length));
  qIndex = 0;
  score = 0;
  resultArea.classList.add("d-none");
  quizArea.classList.remove("d-none");
  document.getElementById("btnStart").textContent = "Restart Speaking Quiz";
  renderQuestion();
}

function finishQuiz() {
  quizActive = false;
  if (recognition && isRecognitionRunning) recognition.abort();
  window.speechSynthesis?.cancel();
  recognition = null;
  isRecognitionRunning = false;
  isCapturing = false;
  isAwaitingResult = false;
  clearTimeout(releaseTimer);
  setListening(false);
  quizArea.classList.add("d-none");
  resultArea.classList.remove("d-none");
  document.getElementById("finalScore").textContent = `${score} / ${questions.length}`;
}

document.getElementById("btnStart").addEventListener("click", startQuiz);
document.getElementById("btnSelectAllSets").addEventListener("click", () => {
  document.querySelectorAll(".speaking-set-input").forEach(input => input.checked = true);
  saveSelectedSets();
});
document.getElementById("btnClearSets").addEventListener("click", () => {
  document.querySelectorAll(".speaking-set-input").forEach(input => input.checked = false);
  saveSelectedSets();
});
btnSpeak.addEventListener("pointerdown", beginSpeaking);
btnSpeak.addEventListener("pointerup", stopSpeaking);
btnSpeak.addEventListener("pointercancel", cancelSpeaking);
btnSpeak.addEventListener("contextmenu", event => event.preventDefault());
document.getElementById("btnHearCorrect").addEventListener("click", speakCorrectAnswer);
document.getElementById("btnNext").addEventListener("click", () => {
  if (qIndex < questions.length - 1) {
    qIndex++;
    renderQuestion();
  } else {
    finishQuiz();
  }
});
document.getElementById("btnStop").addEventListener("click", finishQuiz);
document.getElementById("btnReplay").addEventListener("click", () => {
  resultArea.classList.add("d-none");
  document.getElementById("btnStart").textContent = "Start Speaking Quiz";
});

renderSetPicker();
if (!SpeechRecognition) {
  unsupportedMessage.classList.remove("d-none");
  document.getElementById("btnStart").disabled = true;
}
