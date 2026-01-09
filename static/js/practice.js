



// Uses window.DATA from words-data.js
    // (Your words-data.js defines window.DATA) :contentReference[oaicite:1]{index=1}

    const btnStart = document.getElementById("btnStart");
    const questionCountEl = document.getElementById("questionCount");

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

    function flattenData(DATA) {
      // DATA: { setName: { sectionName: [ [fr,en], ... ] } }
      const items = [];
      for (const setName of Object.keys(DATA || {})) {
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

          // color feedback
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
    }

    function startQuiz() {
      // Ensure DATA exists
      if (!window.DATA) {
        alert("Words data not loaded. Check static/js/words-data.js path.");
        return;
      }

      allItems = flattenData(window.DATA);
      if (allItems.length < 3) {
        alert("Not enough words to start quiz.");
        return;
      }

      const n = parseInt(questionCountEl.value, 10) || 10;

      questions = buildQuestions(n);
      qIndex = 0;
      score = 0;

      resultArea.classList.add("d-none");
      quizArea.classList.remove("d-none");
      btnStop.classList.remove("d-none");
      btnReplayTop.classList.remove("d-none");

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

    function replay() {
      startQuiz();
    }

    function stopQuiz() {
      finishQuiz();
    }

    // ---------- Events ----------
    btnStart.addEventListener("click", startQuiz);
    btnNext.addEventListener("click", nextQuestion);
    btnReplay.addEventListener("click", replay);
    btnReplayTop.addEventListener("click", replay);
    btnStop.addEventListener("click", stopQuiz);



