const setupArea = document.getElementById("setupArea");
const quizArea = document.getElementById("quizArea");
const resultArea = document.getElementById("resultArea");
const setPicker = document.getElementById("setPicker");
const questionCount = document.getElementById("questionCount");
const answerInput = document.getElementById("answerInput");
const feedback = document.getElementById("feedback");
let questions = [], index = 0, score = 0, missed = [], allItems = [], answered = false;

function shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function normalize(answer) { return answer.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr"); }
function selectedSets() { return [...document.querySelectorAll(".writing-set:checked")].map(input => input.value); }
function flattenData(sets) { return sets.flatMap(setName => Object.entries(window.DATA[setName] || {}).flatMap(([sectionName, pairs]) => pairs.map(([fr, en]) => ({ fr: fr.trim(), en: en.trim(), setName, sectionName })))); }

function renderSetPicker() {
  const saved = JSON.parse(localStorage.getItem("writingSelectedSets") || "[]");
  const names = Object.keys(window.DATA || {}); const selected = saved.length ? saved : names;
  setPicker.innerHTML = names.map((name, i) => `<div class="form-check practice-set-option"><input class="form-check-input writing-set" type="checkbox" value="${name}" id="writing-set-${i}" ${selected.includes(name) ? "checked" : ""}><label class="form-check-label" for="writing-set-${i}">${name}</label></div>`).join("");
  setPicker.addEventListener("change", () => localStorage.setItem("writingSelectedSets", JSON.stringify(selectedSets())));
}

function setAllSets(checked) {
  document.querySelectorAll(".writing-set").forEach(input => { input.checked = checked; });
  localStorage.setItem("writingSelectedSets", JSON.stringify(selectedSets()));
}

function renderQuestion() {
  answered = false; feedback.className = "alert d-none mt-3 mb-0"; answerInput.value = ""; answerInput.disabled = false;
  document.getElementById("btnCheck").classList.remove("d-none"); document.getElementById("btnNext").classList.add("d-none");
  const question = questions[index]; document.getElementById("progressPill").textContent = `Q ${index + 1}/${questions.length}`; document.getElementById("scorePill").textContent = `Score: ${score}`;
  document.getElementById("questionText").textContent = question.en; document.getElementById("metaText").textContent = `${question.setName} • ${question.sectionName}`; answerInput.focus();
}

function checkAnswer() {
  if (answered) return; const question = questions[index]; const isCorrect = normalize(answerInput.value) === normalize(question.fr); answered = true; answerInput.disabled = true;
  if (isCorrect) { score++; feedback.className = "alert alert-success mt-3 mb-0"; feedback.textContent = `Correct — ${question.fr}`; } else { missed.push(question); feedback.className = "alert alert-danger mt-3 mb-0"; feedback.innerHTML = `Not quite. Correct answer: <strong>${question.fr}</strong>`; }
  document.getElementById("scorePill").textContent = `Score: ${score}`; document.getElementById("btnCheck").classList.add("d-none"); document.getElementById("btnNext").classList.remove("d-none");
}

function finishQuiz() {
  quizArea.classList.add("d-none"); resultArea.classList.remove("d-none"); document.getElementById("finalScore").textContent = `${score} / ${questions.length}`;
  const missedArea = document.getElementById("missedArea"); const missedList = document.getElementById("missedList"); missedList.innerHTML = missed.map(item => `<li class="list-group-item"><strong>${item.en}</strong> — ${item.fr}</li>`).join(""); missedArea.classList.toggle("d-none", !missed.length);
}

function startQuiz() {
  const sets = selectedSets(); if (!sets.length) return alert("Select at least one vocabulary set."); allItems = flattenData(sets); if (!allItems.length) return alert("There are no words in the selected sets.");
  questions = shuffle(allItems).slice(0, Math.min(Number(questionCount.value), allItems.length)); index = 0; score = 0; missed = []; setupArea.classList.add("d-none"); resultArea.classList.add("d-none"); quizArea.classList.remove("d-none"); renderQuestion();
}
document.getElementById("btnStart").addEventListener("click", startQuiz); document.getElementById("btnCheck").addEventListener("click", checkAnswer); document.getElementById("btnNext").addEventListener("click", () => { index++; index < questions.length ? renderQuestion() : finishQuiz(); }); document.getElementById("btnStop").addEventListener("click", finishQuiz); document.getElementById("btnReplay").addEventListener("click", () => { resultArea.classList.add("d-none"); setupArea.classList.remove("d-none"); }); document.getElementById("btnSelectAllSets").addEventListener("click", () => setAllSets(true)); document.getElementById("btnClearSets").addEventListener("click", () => setAllSets(false)); answerInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); answered ? document.getElementById("btnNext").click() : checkAnswer(); } });
renderSetPicker();
