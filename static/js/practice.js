



// Uses window.DATA from words-data.js
    // (Your words-data.js defines window.DATA) :contentReference[oaicite:1]{index=1}

    const btnStart = document.getElementById("btnStart");
    const questionCountEl = document.getElementById("questionCount");
    const setPicker = document.getElementById("setPicker");
    const setupArea = document.getElementById("setupArea");
    const quizSetLabel = document.getElementById("quizSetLabel");
    const btnSelectAllSets = document.getElementById("btnSelectAllSets");
    const btnClearSets = document.getElementById("btnClearSets");

    const quizArea = document.getElementById("quizArea");
    const resultArea = document.getElementById("resultArea");

    const progressPill = document.getElementById("progressPill");
    const scorePill = document.getElementById("scorePill");

    const questionText = document.getElementById("questionText");
    const metaText = document.getElementById("metaText");
    const optionsEl = document.getElementById("options");

    const btnNext = document.getElementById("btnNext");
    const btnStop = document.getElementById("btnStop");
    const btnReplay = document.getElementById("btnReplay");
    const btnReplayTop = document.getElementById("btnReplayTop");
    const finalScore = document.getElementById("finalScore");

    // ---------- Helpers ----------
    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function flattenData(DATA, selectedSets = Object.keys(DATA || {})) {
      // DATA: { setName: { sectionName: [ [fr,en], ... ] } }
      const items = [];
      for (const setName of selectedSets) {
        const sections = DATA[setName] || {};
        for (const sectionName of Object.keys(sections)) {
          const pairs = sections[sectionName] || [];
          for (const [fr, en] of pairs) {
            if (typeof fr === "string" && typeof en === "string") {
              items.push({ fr: fr.trim(), en: en.trim(), setName, sectionName });
            }
          }
        }
      }
      return items;
    }

    function renderSetPicker() {
      if (!window.DATA) return;

      const setNames = Object.keys(window.DATA);
      const savedSets = JSON.parse(localStorage.getItem("practiceSelectedSets") || "[]");
      const selectedSets = savedSets.length ? savedSets : setNames;

      setPicker.innerHTML = "";
      setNames.forEach(setName => {
        const id = `practice-set-${setName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
        const wrapper = document.createElement("div");
        wrapper.className = "form-check practice-set-option";
        const compactName = setName.replace(/^Set\s+/i, "");
        wrapper.innerHTML = `
          <input class="form-check-input practice-set-input" type="checkbox" value="${setName}" id="${id}">
          <label class="form-check-label" for="${id}" title="${setName}">${compactName}</label>`;
        const input = wrapper.querySelector("input");
        input.checked = selectedSets.includes(setName);
        input.addEventListener("change", saveSelectedSets);
        setPicker.appendChild(wrapper);
      });
    }

    function getSelectedSets() {
      return Array.from(document.querySelectorAll(".practice-set-input:checked"), input => input.value);
    }

    function saveSelectedSets() {
      localStorage.setItem("practiceSelectedSets", JSON.stringify(getSelectedSets()));
    }

    function setAllSets(checked) {
      document.querySelectorAll(".practice-set-input").forEach(input => {
        input.checked = checked;
      });
      saveSelectedSets();
    }

    function formatSetLabel(setNames) {
      return `Sets: ${setNames.map(name => name.replace(/^Set\s+/i, "")).join(", ")}`;
    }

    function sampleWrongOptions(allItems, correctEn, count = 2) {
      // pick distinct wrong English meanings
      const pool = allItems.map(x => x.en).filter(en => en && en !== correctEn);
      const unique = Array.from(new Set(pool));
      return shuffle(unique).slice(0, count);
    }

    // ---------- Quiz State ----------
    let allItems = [];
    let questions = [];
    let qIndex = 0;
    let score = 0;
    let locked = false;
    let missed = [];

    function buildQuestions(n) {
      const shuffled = shuffle(allItems);
      return shuffled.slice(0, Math.min(n, shuffled.length)).map(item => {
        const wrongs = sampleWrongOptions(allItems, item.en, 2);
        const opts = shuffle([item.en, ...wrongs]);
        return { ...item, options: opts };
      });
    }

    function renderQuestion() {
      locked = false;
      btnNext.classList.add("d-none");

      const q = questions[qIndex];
      progressPill.textContent = `Q ${qIndex + 1}/${questions.length}`;
      scorePill.textContent = `Score: ${score}`;

      questionText.textContent = q.fr;
      metaText.textContent = `${q.setName} • ${q.sectionName}`;

      optionsEl.innerHTML = "";
      q.options.forEach(opt => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-outline-dark option-btn";
        b.textContent = opt;

        b.addEventListener("click", () => {
          if (locked) return;
          locked = true;

          const isCorrect = opt === q.en;
          if (isCorrect) score++;
          else missed.push(q);

          // Show the correct answer and the selected incorrect answer.
          for (const child of optionsEl.querySelectorAll("button")) {
            child.disabled = true;
            if (child.textContent === q.en) {
              child.className = "btn btn-success option-btn";
            } else if (child.textContent === opt && !isCorrect) {
              child.className = "btn btn-danger option-btn";
            } else {
              child.className = "btn btn-outline-secondary option-btn";
            }
          }

          scorePill.textContent = `Score: ${score}`;
          btnNext.classList.remove("d-none");
        });

        optionsEl.appendChild(b);
      });
    }

    function finishQuiz() {
      quizArea.classList.add("d-none");
      resultArea.classList.remove("d-none");
      btnReplayTop.classList.add("d-none");
      finalScore.textContent = `${score} / ${questions.length}`;
      const missedArea = document.getElementById("missedArea");
      const missedList = document.getElementById("missedList");
      missedList.innerHTML = missed.map(item =>
        `<li class="list-group-item"><strong>${item.fr}</strong> — ${item.en}</li>`
      ).join("");
      missedArea.classList.toggle("d-none", !missed.length);
    }

    function startQuiz() {
      // Ensure DATA exists
      if (!window.DATA) {
        alert("Words data not loaded. Check static/js/words-data.js path.");
        return;
      }

      const selectedSets = getSelectedSets();
      if (!selectedSets.length) {
        alert("Select at least one vocabulary set to start the quiz.");
        return;
      }

      allItems = flattenData(window.DATA, selectedSets);
      if (allItems.length < 3) {
        alert("Not enough words to start quiz.");
        return;
      }

      const n = parseInt(questionCountEl.value, 10) || 10;

      questions = buildQuestions(n);
      qIndex = 0;
      score = 0;
      missed = [];

      resultArea.classList.add("d-none");
      setupArea.classList.add("d-none");
      quizArea.classList.remove("d-none");
      btnStop.classList.remove("d-none");
      btnReplayTop.classList.remove("d-none");
      quizSetLabel.textContent = formatSetLabel(selectedSets);

      renderQuestion();
    }

    function nextQuestion() {
      if (qIndex < questions.length - 1) {
        qIndex++;
        renderQuestion();
      } else {
        finishQuiz();
      }
    }

    function showConfiguration() {
      resultArea.classList.add("d-none");
      setupArea.classList.remove("d-none");
    }

    function stopQuiz() {
      finishQuiz();
    }

    // ---------- Events ----------
    btnStart.addEventListener("click", startQuiz);
    btnNext.addEventListener("click", nextQuestion);
    btnReplay.addEventListener("click", showConfiguration);
    btnReplayTop.addEventListener("click", startQuiz);
    btnStop.addEventListener("click", stopQuiz);
    btnSelectAllSets.addEventListener("click", () => setAllSets(true));
    btnClearSets.addEventListener("click", () => setAllSets(false));

    renderSetPicker();



