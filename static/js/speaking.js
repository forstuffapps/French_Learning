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

let questions = [];
let qIndex = 0;
let score = 0;
let recognition = null;
let isListening = false;
let microphoneStream = null;
let isAcceptingAnswer = false;
let isHoldingSpeakButton = false;
let releaseTimer = null;
let recognizedTranscript = "";

const FRENCH_NUMBERS = {
  0: "zero", 1: "un", 2: "deux", 3: "trois", 4: "quatre", 5: "cinq",
  6: "six", 7: "sept", 8: "huit", 9: "neuf", 10: "dix", 11: "onze",
  12: "douze", 13: "treize", 14: "quatorze", 15: "quinze", 16: "seize",
  17: "dix sept", 18: "dix huit", 19: "dix neuf", 20: "vingt",
  30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante",
  70: "soixante dix", 80: "quatre vingts", 90: "quatre vingt dix",
  100: "cent", 1000: "mille"
};

function normalizeForComparison(text) {
  return text.toLocaleLowerCase("fr-FR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\d+/g, number => FRENCH_NUMBERS[number] || number)
    .replace(/[\u2019']/g, " ").replace(/-/g, " ")
    .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

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
    .replace(/[’']/g, " ").replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function flattenData(selectedSets) {
  const items = [];
  selectedSets.forEach(setName => {
    Object.entries(window.DATA[setName] || {}).forEach(([sectionName, pairs]) => {
      pairs.forEach(([fr, en]) => items.push({ fr, en, setName, sectionName }));
    });
  });
  return items;
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

function getSelectedSets() {
  return Array.from(document.querySelectorAll(".speaking-set-input:checked"), input => input.value);
}

function saveSelectedSets() {
  localStorage.setItem("speakingSelectedSets", JSON.stringify(getSelectedSets()));
}

function speakCorrectAnswer() {
  const target = questions[qIndex]?.fr;
  if (!target || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(target);
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
  statusText.textContent = "Press the button and say the word.";
  btnSpeak.disabled = false;
  btnSpeak.textContent = "Hold to speak";
  feedbackArea.classList.add("d-none");
  recognizedTranscript = "";
  document.getElementById("listeningAnimation").classList.add("d-none");
}

function showFeedback(transcript) {
  const question = questions[qIndex];
  const correct = normalizeForComparison(transcript) === normalizeForComparison(question.fr);
  if (correct) score++;
  scorePill.textContent = `Score: ${score}`;
  feedbackText.textContent = correct ? "Correct — well done!" : "Not quite. Try to say the word shown.";
  feedbackText.className = `fw-semibold mb-2 ${correct ? "text-success" : "text-danger"}`;
  heardText.textContent = transcript ? `We heard: “${transcript}”` : "We could not hear a word.";
  statusText.textContent = "The correct pronunciation is now playing.";
  feedbackArea.classList.remove("d-none");
  btnSpeak.disabled = true;
  isAcceptingAnswer = false;
  isHoldingSpeakButton = false;
  clearTimeout(releaseTimer);
  speakCorrectAnswer();
}

function initialiseRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = "fr-FR";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    isListening = true;
    if (isAcceptingAnswer) {
      btnSpeak.textContent = "Listening…";
      statusText.textContent = "Say the word clearly, then wait a moment.";
      document.getElementById("listeningAnimation").classList.remove("d-none");
    }
  };
  recognition.onresult = event => {
    if (!isAcceptingAnswer) return;
    const result = event.results[event.results.length - 1][0];
    recognizedTranscript = result.transcript;
    if (!isHoldingSpeakButton) {
      clearTimeout(releaseTimer);
      showFeedback(recognizedTranscript);
    }
  };
  recognition.onerror = event => {
    isAcceptingAnswer = false;
    isHoldingSpeakButton = false;
    document.getElementById("listeningAnimation").classList.add("d-none");
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      statusText.textContent = "Microphone access was blocked. Allow it in your browser settings and try again.";
    } else if (event.error === "no-speech") {
      statusText.textContent = "No speech was detected. Please try again.";
    } else {
      statusText.textContent = "Speech recognition could not complete. Please try again.";
    }
    btnSpeak.disabled = false;
    btnSpeak.textContent = "Try again";
  };
  recognition.onend = () => {
    isListening = false;
    document.getElementById("listeningAnimation").classList.add("d-none");
    if (isAcceptingAnswer) {
      isAcceptingAnswer = false;
      statusText.textContent = "Speech recognition stopped. Press the button to try again.";
      btnSpeak.disabled = false;
      btnSpeak.textContent = "Hold to speak";
    }
  };
}

function keepRecognitionReady() {
  if (isListening) return;
  try {
    recognition.start();
  } catch (error) {
    // A recognition session can take a moment to close after a quiz ends.
  }
}

async function startQuiz() {
  const selectedSets = getSelectedSets();
  const items = flattenData(selectedSets);
  if (!selectedSets.length) return alert("Select at least one vocabulary set.");
  if (!items.length) return alert("There are no words in the selected sets.");
  if (!microphoneStream) {
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      alert("Microphone access is required for the Speaking Quiz. Please allow it and try again.");
      return;
    }
  }
  const count = Number.parseInt(questionCountEl.value, 10) || 10;
  questions = shuffle(items).slice(0, Math.min(count, items.length));
  qIndex = 0;
  score = 0;
  resultArea.classList.add("d-none");
  quizArea.classList.remove("d-none");
  document.getElementById("btnStart").textContent = "Restart Speaking Quiz";
  renderQuestion();
  keepRecognitionReady();
}

function finishQuiz() {
  isAcceptingAnswer = false;
  isHoldingSpeakButton = false;
  clearTimeout(releaseTimer);
  if (isListening) recognition.abort();
  window.speechSynthesis?.cancel();
  microphoneStream?.getTracks().forEach(track => track.stop());
  microphoneStream = null;
  quizArea.classList.add("d-none");
  resultArea.classList.remove("d-none");
  document.getElementById("finalScore").textContent = `${score} / ${questions.length}`;
}

document.getElementById("btnStart").addEventListener("click", startQuiz);
document.getElementById("btnSelectAllSets").addEventListener("click", () => {
  document.querySelectorAll(".speaking-set-input").forEach(input => input.checked = true); saveSelectedSets();
});
document.getElementById("btnClearSets").addEventListener("click", () => {
  document.querySelectorAll(".speaking-set-input").forEach(input => input.checked = false); saveSelectedSets();
});
function beginSpeaking(event) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  keepRecognitionReady();
  isAcceptingAnswer = true;
  isHoldingSpeakButton = true;
  recognizedTranscript = "";
  btnSpeak.textContent = "Listening… release when finished";
  statusText.textContent = "Keep holding the button while you say the word.";
  document.getElementById("listeningAnimation").classList.remove("d-none");
  btnSpeak.setPointerCapture?.(event.pointerId);
}

function finishSpeaking(event) {
  if (!isHoldingSpeakButton) return;
  event.preventDefault();
  isHoldingSpeakButton = false;
  btnSpeak.releasePointerCapture?.(event.pointerId);
  document.getElementById("listeningAnimation").classList.add("d-none");
  btnSpeak.textContent = "Checking…";
  statusText.textContent = "Checking what we heard…";
  if (recognizedTranscript) {
    showFeedback(recognizedTranscript);
    return;
  }
  // Final recognition results can arrive just after the user releases the button.
  releaseTimer = setTimeout(() => {
    if (isAcceptingAnswer) showFeedback("");
  }, 1200);
}

btnSpeak.addEventListener("pointerdown", beginSpeaking);
btnSpeak.addEventListener("pointerup", finishSpeaking);
btnSpeak.addEventListener("pointercancel", finishSpeaking);
btnSpeak.addEventListener("contextmenu", event => event.preventDefault());
document.getElementById("btnHearCorrect").addEventListener("click", speakCorrectAnswer);
document.getElementById("btnNext").addEventListener("click", () => {
  if (qIndex < questions.length - 1) { qIndex++; renderQuestion(); } else { finishQuiz(); }
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
} else {
  initialiseRecognition();
}
