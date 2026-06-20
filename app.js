const els = {
  bankMeta: document.querySelector("#bankMeta"),
  chapterCount: document.querySelector("#chapterCount"),
  chapterList: document.querySelector("#chapterList"),
  currentChapterTitle: document.querySelector("#currentChapterTitle"),
  questionList: document.querySelector("#questionList"),
  questionCard: document.querySelector("#questionCard"),
  statTotal: document.querySelector("#statTotal"),
  statDone: document.querySelector("#statDone"),
  statCorrect: document.querySelector("#statCorrect"),
  statWrong: document.querySelector("#statWrong"),
  jsonImport: document.querySelector("#jsonImport"),
  profileInput: document.querySelector("#profileInput"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  supabaseUrl: document.querySelector("#supabaseUrl"),
  supabaseKey: document.querySelector("#supabaseKey"),
  saveSupabase: document.querySelector("#saveSupabase"),
  clearSupabase: document.querySelector("#clearSupabase"),
  exportBank: document.querySelector("#exportBank"),
  restoreBank: document.querySelector("#restoreBank"),
  exportProgress: document.querySelector("#exportProgress"),
  progressImport: document.querySelector("#progressImport"),
  resetChapter: document.querySelector("#resetChapter"),
  modePanel: document.querySelector(".mode-panel"),
  catalogButton: document.querySelector("#catalogButton"),
  wrongButton: document.querySelector("#wrongButton"),
  settingsButton: document.querySelector("#settingsButton"),
  catalogView: document.querySelector("#catalogView"),
  practiceView: document.querySelector("#practiceView"),
  settingsView: document.querySelector("#settingsView"),
  wrongView: document.querySelector("#wrongView"),
  backPractice: document.querySelectorAll(".backPractice"),
};

let bank = { chapters: [] };
let defaultBank = null;
let state = {
  profile: localStorage.getItem("qb.profile") || "default",
  answers: {},
  supabaseUrl: localStorage.getItem("qb.supabaseUrl") || "",
  supabaseKey: localStorage.getItem("qb.supabaseKey") || "",
  chapterIndex: 0,
  questionIndex: 0,
  mode: "all",
  view: "practice",
};

let saveTimer = null;

function questionId(chapter, question) {
  return question.id || `${chapter.id}-${question.number}`;
}

function allQuestions() {
  return bank.chapters.flatMap((chapter) =>
    chapter.questions.map((question) => ({ chapter, question }))
  );
}

function currentChapter() {
  return bank.chapters[state.chapterIndex] || null;
}

function answerRecord(chapter, question) {
  return state.answers[questionId(chapter, question)] || null;
}

function questionsForMode(chapter) {
  if (!chapter) return [];
  if (state.mode === "wrong") {
    return chapter.questions.filter((question) => {
      const record = answerRecord(chapter, question);
      return record && record.wrongTimes > 0;
    });
  }
  if (state.mode === "repeatWrong") {
    return chapter.questions.filter((question) => {
      const record = answerRecord(chapter, question);
      return record && record.wrongTimes > 0 && (record.correctStreak || 0) < 2;
    });
  }
  return chapter.questions;
}

function chapterStats(chapter) {
  const records = chapter.questions.map((question) => answerRecord(chapter, question));
  const done = records.filter(Boolean).length;
  const correct = records.filter((record) => record && record.correct).length;
  const wrong = records.filter((record) => record && record.wrongTimes > 0).length;
  return { total: chapter.questions.length, done, correct, wrong };
}

function setSyncStatus(text) {
  els.syncStatus.textContent = text;
}

function localStorageKey() {
  return `qb.progress.${state.profile}`;
}

function hasSupabaseConfig() {
  return Boolean(state.supabaseUrl && state.supabaseKey);
}

function supabaseHeaders() {
  const headers = {
    apikey: state.supabaseKey,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };
  if (!state.supabaseKey.startsWith("sb_publishable_")) {
    headers.Authorization = `Bearer ${state.supabaseKey}`;
  }
  return headers;
}

function supabaseEndpoint() {
  return `${state.supabaseUrl.replace(/\/+$/, "")}/rest/v1/question_progress`;
}

function saveBankToLocal() {
  localStorage.setItem("qb.customBank", JSON.stringify(bank));
}

function loadBankFromLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem("qb.customBank") || "null");
    return saved && Array.isArray(saved.chapters) ? saved : null;
  } catch {
    return null;
  }
}

function loadLocalProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(localStorageKey()) || "{}");
    state.answers = saved.answers || {};
  } catch {
    state.answers = {};
  }
}

function saveLocalProgress() {
  localStorage.setItem(
    localStorageKey(),
    JSON.stringify({ answers: state.answers, updatedAt: new Date().toISOString() })
  );
}

async function syncFromServer() {
  if (hasSupabaseConfig()) {
    try {
      const url = `${supabaseEndpoint()}?profile=eq.${encodeURIComponent(state.profile)}&select=answers,updated_at`;
      const response = await fetch(url, { headers: supabaseHeaders() });
      if (!response.ok) throw new Error("supabase sync unavailable");
      const rows = await response.json();
      const remote = rows[0] || null;
      state.answers = remote ? remote.answers || {} : {};
      saveLocalProgress();
      setSyncStatus(
        remote ? `公网已同步 ${new Date(remote.updated_at).toLocaleString()}` : "公网同步已连接"
      );
      render();
      return;
    } catch {
      loadLocalProgress();
      setSyncStatus("公网同步失败，已使用本机记录");
      render();
      return;
    }
  }

  try {
    const response = await fetch(`/api/progress?profile=${encodeURIComponent(state.profile)}`);
    if (!response.ok) throw new Error("sync unavailable");
    const remote = await response.json();
    state.answers = remote.answers || {};
    saveLocalProgress();
    setSyncStatus(remote.updatedAt ? `已同步 ${new Date(remote.updatedAt).toLocaleString()}` : "已连接同步");
    render();
  } catch {
    loadLocalProgress();
    setSyncStatus("离线本地记录");
    render();
  }
}

async function pushProgress() {
  saveLocalProgress();
  if (hasSupabaseConfig()) {
    try {
      const response = await fetch(`${supabaseEndpoint()}?on_conflict=profile`, {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify({
          profile: state.profile,
          answers: state.answers,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error("supabase save failed");
      const rows = await response.json();
      const saved = rows[0] || {};
      setSyncStatus(
        saved.updated_at ? `公网已同步 ${new Date(saved.updated_at).toLocaleString()}` : "公网已同步"
      );
      return;
    } catch {
      setSyncStatus("公网同步失败，已保存到本机");
      return;
    }
  }

  try {
    const response = await fetch(`/api/progress?profile=${encodeURIComponent(state.profile)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: state.answers }),
    });
    if (!response.ok) throw new Error("sync failed");
    const saved = await response.json();
    setSyncStatus(`已同步 ${new Date(saved.updatedAt).toLocaleString()}`);
  } catch {
    setSyncStatus("已保存到本机");
  }
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(pushProgress, 250);
}

function renderChapters() {
  els.chapterCount.textContent = bank.chapters.length;
  els.chapterList.innerHTML = "";
  bank.chapters.forEach((chapter, index) => {
    const stats = chapterStats(chapter);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chapter-button${index === state.chapterIndex ? " active" : ""}`;
    button.innerHTML = `
      <span class="chapter-main">
        <strong>${escapeHtml(chapter.title)}</strong>
        <span>${stats.done}/${stats.total} 已做 · ${stats.wrong} 错题</span>
      </span>
      <span class="delete-chapter" title="删除本章" aria-label="删除本章">×</span>
    `;
    button.addEventListener("click", () => {
      state.chapterIndex = index;
      state.questionIndex = 0;
      state.view = "practice";
      render();
    });
    button.querySelector(".delete-chapter").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteChapter(index);
    });
    els.chapterList.appendChild(button);
  });
}

function deleteChapter(index) {
  const chapter = bank.chapters[index];
  if (!chapter) return;
  if (!confirm(`确定删除“${chapter.title}”？删除后可用“恢复默认”找回原始题库。`)) return;

  chapter.questions.forEach((question) => {
    delete state.answers[questionId(chapter, question)];
  });
  bank.chapters.splice(index, 1);
  state.chapterIndex = Math.min(state.chapterIndex, Math.max(bank.chapters.length - 1, 0));
  state.questionIndex = 0;
  saveBankToLocal();
  scheduleSave();
  render();
}

function renderStats(chapter) {
  const stats = chapter ? chapterStats(chapter) : { total: 0, done: 0, correct: 0, wrong: 0 };
  els.statTotal.textContent = stats.total;
  els.statDone.textContent = stats.done;
  els.statCorrect.textContent = stats.correct;
  els.statWrong.textContent = stats.wrong;
}

function renderQuestionList(chapter, visibleQuestions) {
  els.currentChapterTitle.textContent = chapter ? chapter.title : "请选择章节";
  els.questionList.innerHTML = "";

  if (!visibleQuestions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.mode === "all" ? "本章没有题目。" : "当前模式下没有题目。";
    els.questionList.appendChild(empty);
    return;
  }

  visibleQuestions.forEach((question, index) => {
    const record = answerRecord(chapter, question);
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "question-index",
      index === state.questionIndex ? "active" : "",
      record ? (record.correct ? "correct" : "wrong") : "",
    ]
      .filter(Boolean)
      .join(" ");
    button.textContent = question.number;
    button.addEventListener("click", () => {
      state.questionIndex = index;
      render();
    });
    els.questionList.appendChild(button);
  });
}

function renderQuestion(chapter, visibleQuestions) {
  const question = visibleQuestions[state.questionIndex];
  if (!chapter || !question) {
    els.questionCard.innerHTML = `<div class="empty-state">当前没有可练习题目。</div>`;
    return;
  }

  const record = answerRecord(chapter, question);
  const selected = record ? record.selected : "";
  const answered = Boolean(record);

  const options = question.options
    .map((option) => {
      const isSelected = selected === option.key;
      const isCorrect = answered && option.key === question.answer;
      const isWrongSelected = answered && isSelected && selected !== question.answer;
      const classes = [
        "option",
        isSelected ? "selected" : "",
        isCorrect ? "correct-answer" : "",
        isWrongSelected ? "wrong-answer" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<button class="${classes}" type="button" data-key="${option.key}">
        <span class="option-key">${option.key}</span>
        <span>${escapeHtml(option.text)}</span>
      </button>`;
    })
    .join("");

  const result = answered
    ? `<div class="result-box">
        <div>
          <strong class="${record.correct ? "ok" : "bad"}">${record.correct ? "回答正确" : "回答错误"}</strong>
          <span> 正确答案：${question.answer}</span>
        </div>
        <button type="button" id="nextQuestion">下一题</button>
      </div>`
    : "";

  els.questionCard.innerHTML = `
    <div class="question-meta">
      <span>${chapter.title}</span>
      <span>第 ${question.number} 题</span>
      <span>${question.type || ""}</span>
    </div>
    <div class="question-stem">${escapeHtml(question.stem)}</div>
    <div class="options">${options}</div>
    ${result}
  `;

  els.questionCard.querySelectorAll(".option").forEach((button) => {
    button.addEventListener("click", () => chooseAnswer(chapter, question, button.dataset.key));
  });
  const next = els.questionCard.querySelector("#nextQuestion");
  if (next) {
    next.addEventListener("click", () => {
      state.questionIndex = Math.min(state.questionIndex + 1, visibleQuestions.length - 1);
      render();
    });
  }
}

function chooseAnswer(chapter, question, selected) {
  const id = questionId(chapter, question);
  const previous = state.answers[id] || { times: 0, wrongTimes: 0, correctStreak: 0 };
  const correct = selected === question.answer;
  state.answers[id] = {
    selected,
    correct,
    times: previous.times + 1,
    wrongTimes: previous.wrongTimes + (correct ? 0 : 1),
    correctStreak: correct ? (previous.correctStreak || 0) + 1 : 0,
    lastAt: new Date().toISOString(),
  };
  scheduleSave();
  render();
}

function render() {
  const chapter = currentChapter();
  const visibleQuestions = questionsForMode(chapter);
  if (state.questionIndex >= visibleQuestions.length) state.questionIndex = 0;
  renderChapters();
  renderStats(chapter);
  renderQuestionList(chapter, visibleQuestions);
  renderQuestion(chapter, visibleQuestions);
  els.modePanel.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
  const total = allQuestions().length;
  els.bankMeta.textContent = `${bank.chapters.length} 章 · ${total} 题`;
  els.catalogView.hidden = state.view !== "catalog";
  els.practiceView.hidden = state.view !== "practice";
  els.settingsView.hidden = state.view !== "settings";
  els.wrongView.hidden = state.view !== "wrong";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function readJsonFile(file) {
  return JSON.parse(await file.text());
}

function setBank(nextBank) {
  if (!nextBank || !Array.isArray(nextBank.chapters)) {
    throw new Error("JSON 格式不正确，需要包含 chapters 数组。");
  }
  bank = nextBank;
  state.chapterIndex = 0;
  state.questionIndex = 0;
  render();
}

els.modePanel.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.mode = button.dataset.mode;
  state.questionIndex = 0;
  state.view = "practice";
  render();
});

els.jsonImport.addEventListener("change", async () => {
  const file = els.jsonImport.files[0];
  if (!file) return;
  try {
    setBank(await readJsonFile(file));
    saveBankToLocal();
  } catch (error) {
    alert(error.message);
  } finally {
    els.jsonImport.value = "";
  }
});

els.exportBank.addEventListener("click", () => {
  downloadJson("questions-current.json", bank);
});

els.restoreBank.addEventListener("click", () => {
  if (!defaultBank) return;
  if (!confirm("确定恢复默认题库？当前删除或导入的题库调整会被覆盖。")) return;
  bank = structuredClone(defaultBank);
  localStorage.removeItem("qb.customBank");
  state.chapterIndex = 0;
  state.questionIndex = 0;
  render();
});

els.catalogButton.addEventListener("click", () => {
  state.view = "catalog";
  render();
});

els.wrongButton.addEventListener("click", () => {
  state.view = "wrong";
  render();
});

els.settingsButton.addEventListener("click", () => {
  state.view = "settings";
  render();
});

els.backPractice.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = "practice";
    render();
  });
});

function goPractice() {
  state.view = "practice";
  render();
}

els.profileInput.value = state.profile;
els.supabaseUrl.value = state.supabaseUrl;
els.supabaseKey.value = state.supabaseKey;
els.syncButton.addEventListener("click", () => {
  state.profile = els.profileInput.value.trim() || "default";
  localStorage.setItem("qb.profile", state.profile);
  syncFromServer();
});

els.saveSupabase.addEventListener("click", () => {
  state.supabaseUrl = els.supabaseUrl.value.trim();
  state.supabaseKey = els.supabaseKey.value.trim();
  localStorage.setItem("qb.supabaseUrl", state.supabaseUrl);
  localStorage.setItem("qb.supabaseKey", state.supabaseKey);
  setSyncStatus("公网同步配置已保存");
  syncFromServer();
});

els.clearSupabase.addEventListener("click", () => {
  state.supabaseUrl = "";
  state.supabaseKey = "";
  els.supabaseUrl.value = "";
  els.supabaseKey.value = "";
  localStorage.removeItem("qb.supabaseUrl");
  localStorage.removeItem("qb.supabaseKey");
  setSyncStatus("公网同步配置已清除");
});

els.exportProgress.addEventListener("click", () => {
  downloadJson(`question-bank-progress-${state.profile}.json`, {
    profile: state.profile,
    answers: state.answers,
    exportedAt: new Date().toISOString(),
  });
});

els.progressImport.addEventListener("change", async () => {
  const file = els.progressImport.files[0];
  if (!file) return;
  try {
    const imported = await readJsonFile(file);
    state.answers = imported.answers || {};
    scheduleSave();
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    els.progressImport.value = "";
  }
});

els.resetChapter.addEventListener("click", () => {
  const chapter = currentChapter();
  if (!chapter) return;
  if (!confirm(`确定清空“${chapter.title}”的做题记录？`)) return;
  chapter.questions.forEach((question) => {
    delete state.answers[questionId(chapter, question)];
  });
  state.questionIndex = 0;
  scheduleSave();
  render();
});

async function init() {
  try {
    const response = await fetch("questions.json", { cache: "no-store" });
    defaultBank = await response.json();
    const customBank = loadBankFromLocal();
    setBank(customBank || structuredClone(defaultBank));
  } catch (error) {
    els.bankMeta.textContent = "题库加载失败，请导入 JSON。";
  }
  await syncFromServer();
}

init();
