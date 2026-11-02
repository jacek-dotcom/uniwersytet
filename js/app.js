// Uniwersytet – widoki, formularz wpisu i obsługa kliknięć.
// Adresy widoków (część po #):
//   #/tydzien/RRRR-MM-DD   plan tygodnia      #/zalegle        zaległe wpisy
//   #/przedmiot/<id>       oś czasu przedmiotu #/zadania        zadania i terminy
//   #/niemiecki            moduł Niemiecki     #/podsumowanie/RRRR-MM-DD
//   #/ustawienia           token i repozytorium

import * as cal from "./calendar.js";
import * as store from "./store.js";

const S = {
  settings: {},
  schedule: null,
  daysOff: null,
  subjects: new Map(), // id → przedmiot
  entries: new Map(), // id wpisu ("2026-11-06-ekonometria") → wpis
  error: null,
};

const STATUS_LABEL = {
  wolne: "dzień wolny",
  zapisane: "zapisane",
  odwolane: "nie odbyły się",
  brak: "brak wpisu",
  minelo: "bez wpisu",
  zaplanowane: "zaplanowane",
};
const TASK_KINDS = ["zadanie", "kolokwium", "projekt", "egzamin", "prezentacja", "inne"];

// ---------- pomocnicze ----------

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Tekst z klikalnymi linkami.
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = "toast"), kind === "bad" ? 7000 : 3000);
}

function subject(id) {
  return S.subjects.get(id) || { id, name: id, short: id, kind: "", requiresEntry: true };
}

function daysUntil(date) {
  return Math.round((cal.parse(date) - cal.parse(cal.today())) / 86400000);
}

function dueLabel(date) {
  const n = daysUntil(date);
  if (n === 0) return "dziś";
  if (n === 1) return "jutro";
  if (n === -1) return "wczoraj";
  return n > 0 ? `za ${n} dni` : `${-n} dni temu`;
}

// Zajęcia o danym id; jeśli nie ma ich w planie (np. wpis dodany ręcznie), budujemy je z wpisu.
function findOcc(id) {
  const date = id.slice(0, 10);
  const found = cal.occurrencesOn(date, S.schedule, S.daysOff).find((o) => o.id === id);
  if (found) return found;
  const e = S.entries.get(id) || {};
  return { id, date, subject: e.subject || id.slice(11), start: e.start || "", end: e.end || "", week: e.week || cal.weekType(date, S.schedule), off: null };
}

function statusOf(occ) {
  return cal.status(occ, S.entries.get(occ.id), subject(occ.subject));
}

function backlog() {
  const occs = cal.occurrencesBetween(S.schedule.validFrom || S.schedule.weekAStart, cal.today(), S.schedule, S.daysOff);
  return occs.filter((o) => statusOf(o) === "brak").reverse();
}

// Wszystkie zadania ze wszystkich wpisów: [{ entryId, index, task, entry }]
function allTasks(filter = () => true) {
  const out = [];
  for (const [entryId, entry] of S.entries) {
    if (!filter(entry)) continue;
    (entry.tasks || []).forEach((task, index) => out.push({ entryId, index, task, entry }));
  }
  return out;
}

// ---------- ładowanie danych ----------

// Czyści wszystkie dane z pamięci strony (np. po usunięciu tokenu).
function clearData() {
  S.settings = {};
  S.schedule = null;
  S.daysOff = null;
  S.subjects = new Map();
  S.entries = new Map();
}

async function loadAll() {
  clearData();
  store.init();
  if (!store.canRead()) return;
  const [settings, schedule, daysOff, files] = await Promise.all([
    store.readJSON("settings.json"),
    store.readJSON("schedule.json"),
    store.readJSON("days-off.json"),
    store.listEntryFiles(),
  ]);
  if (!schedule) throw new Error("W repozytorium z danymi brakuje pliku schedule.json.");
  S.settings = settings || {};
  S.schedule = schedule;
  S.daysOff = daysOff || { days: [] };
  S.subjects = new Map(schedule.subjects.map((s) => [s.id, s]));
  const loaded = await Promise.all(files.map((p) => store.readJSON(p).catch(() => null)));
  S.entries = new Map();
  files.forEach((path, i) => {
    if (loaded[i]) S.entries.set(path.split("/").pop().replace(/\.json$/, ""), loaded[i]);
  });
}

// ---------- kawałki widoków ----------

function occRow(o, withDate = false) {
  const sub = subject(o.subject);
  const e = S.entries.get(o.id);
  const st = statusOf(o);
  const when = withDate ? `${cal.fmtDay(o.date, true)} ${cal.fmtDate(o.date)}<br><small>${o.start}</small>` : `${o.start}<br><small>${o.end}</small>`;
  return `<button class="occ st-${st}" data-open="${o.id}">
    <span class="time">${when}</span>
    <span class="body">
      <span class="name">${esc(sub.short)} <small>${esc(sub.kind)}</small></span>
      ${e && e.topic ? `<span class="topic">${esc(e.topic)}</span>` : ""}
    </span>
    <span class="chip">${STATUS_LABEL[st]}</span>
  </button>`;
}

function taskItem({ entryId, index, task, entry }, showSubject = true) {
  const sub = subject(entry.subject);
  const late = task.due && !task.done && task.due < cal.today();
  return `<li class="task ${task.done ? "done" : ""}">
    <input type="checkbox" data-task="${entryId}|${index}" ${task.done ? "checked" : ""} aria-label="Zrobione">
    <span class="body">
      <span class="ttext">${linkify(task.text || "(bez opisu)")}</span>
      <span class="meta">
        ${task.kind ? `<span class="kind">${esc(task.kind)}</span>` : ""}
        ${showSubject ? `<span>${esc(sub.short)}</span>` : ""}
        ${task.due ? `<span class="${late ? "late" : ""}">${cal.fmtDay(task.due, true)} ${cal.fmtDate(task.due)} · ${dueLabel(task.due)}</span>` : ""}
      </span>
    </span>
  </li>`;
}

function entryCard(id, entry, showSubject = false) {
  const sub = subject(entry.subject);
  const tasks = (entry.tasks || []).map((task, index) => ({ entryId: id, index, task, entry }));
  return `<article class="entry ${entry.cancelled ? "cancelled" : ""}">
    <header>
      <span><b>${cal.fmtDay(entry.date, true)} ${cal.fmtDate(entry.date)}</b> · tydz. ${esc(entry.week || "")}${showSubject ? ` · ${esc(sub.short)}` : ""}</span>
      <span>${entry.source === "claude" ? `<span class="badge">Claude</span>` : ""}<button class="link" data-open="${id}">Edytuj</button></span>
    </header>
    ${entry.cancelled ? `<p class="muted">Zajęcia się nie odbyły.</p>` : ""}
    ${entry.topic ? `<p class="topic">${linkify(entry.topic)}</p>` : ""}
    ${entry.materials && entry.materials.length ? `<div class="lbl">Materiały</div><ul class="mats">${entry.materials.map((m) => `<li>${linkify(m)}</li>`).join("")}</ul>` : ""}
    ${tasks.length ? `<div class="lbl">Zadania i terminy</div><ul class="tasks">${tasks.map((t) => taskItem(t, false)).join("")}</ul>` : ""}
    ${entry.notes ? `<div class="lbl">Uwagi</div><p class="notes">${linkify(entry.notes)}</p>` : ""}
  </article>`;
}

function missingCard(o) {
  return `<button class="missing" data-open="${o.id}">
    <span><b>${cal.fmtDay(o.date, true)} ${cal.fmtDate(o.date)}</b> · ${o.start} · tydz. ${o.week}</span>
    <span class="chip">brak wpisu – uzupełnij</span>
  </button>`;
}

// Oś czasu (najnowsze na górze): wpisy + zajęcia, które minęły bez wpisu.
function timeline(subjectIds, showSubject = false) {
  const ids = new Set(subjectIds);
  const items = [];
  for (const [id, e] of S.entries) if (ids.has(e.subject)) items.push({ date: e.date, key: id, html: entryCard(id, e, showSubject) });
  for (const o of backlog()) if (ids.has(o.subject)) items.push({ date: o.date, key: o.id, html: missingCard(o) });
  items.sort((a, b) => (a.key < b.key ? 1 : -1));
  return items.length ? items.map((i) => i.html).join("") : `<p class="empty">Jeszcze nic tu nie ma.</p>`;
}

function weekNav(route, monday) {
  const week = cal.weekType(monday, S.schedule);
  const thisMonday = cal.mondayOf(cal.today());
  return `<div class="weeknav">
    <a class="btn" href="#/${route}/${cal.addDays(monday, -7)}" aria-label="Poprzedni tydzień">‹</a>
    <div class="wk"><span class="ab ab-${week}">${week}</span><span>${cal.fmtRange(monday, cal.addDays(monday, 6))}</span></div>
    <a class="btn" href="#/${route}/${cal.addDays(monday, 7)}" aria-label="Następny tydzień">›</a>
    ${monday !== thisMonday ? `<a class="btn small" href="#/${route}/${thisMonday}">Ten tydzień</a>` : ""}
  </div>`;
}

// ---------- widoki ----------

function viewWeek(param) {
  const monday = cal.mondayOf(param || cal.today());
  const t = cal.today();
  let html = weekNav("tydzien", monday);
  for (let i = 0; i < 7; i++) {
    const date = cal.addDays(monday, i);
    const occs = cal.occurrencesOn(date, S.schedule, S.daysOff);
    const off = cal.dayOff(date, S.daysOff);
    if (i >= 5 && !occs.length && !off) continue;
    html += `<section class="day ${date === t ? "today" : ""}">
      <h3>${cal.fmtDay(date)} <span class="muted">${cal.fmtDate(date)}</span>${date === t ? ` <span class="badge">dziś</span>` : ""}</h3>
      ${off ? `<div class="offline">${esc(off)}</div>` : ""}
      ${occs.length ? occs.map((o) => occRow(o)).join("") : off ? "" : `<p class="empty small">Brak zajęć.</p>`}
    </section>`;
  }
  return html;
}

function viewBacklog() {
  const list = backlog();
  if (!list.length) return `<h2>Zaległe wpisy</h2><p class="empty">Wszystko uzupełnione. 🎉</p>`;
  return `<h2>Zaległe wpisy <span class="count">${list.length}</span></h2>
    <p class="muted">Zajęcia, które już się odbyły i nie mają wpisu. Kliknij, żeby uzupełnić.</p>
    ${list.map((o) => occRow(o, true)).join("")}`;
}

function viewSubject(id) {
  const subs = S.schedule.subjects;
  const picker = `<div class="chips">${subs.map((s) => `<a class="pick ${s.id === id ? "on" : ""}" href="#/przedmiot/${s.id}">${esc(s.short)}</a>`).join("")}</div>`;
  if (!id || !S.subjects.has(id)) return `<h2>Przedmioty</h2>${picker}<p class="muted">Wybierz przedmiot.</p>`;
  const sub = subject(id);
  const entries = [...S.entries.entries()].filter(([, e]) => e.subject === id).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const mats = entries.flatMap(([, e]) => (e.materials || []).map((m) => ({ m, date: e.date })));
  return `${picker}
    <h2>${esc(sub.name)} <small class="muted">${esc(sub.kind)}</small></h2>
    <div class="cols">
      <div><h3>Oś czasu</h3>${timeline([id])}</div>
      <aside><h3>Materiały <span class="count">${mats.length}</span></h3>
        ${mats.length ? `<ul class="mats">${mats.map(({ m, date }) => `<li>${linkify(m)} <small class="muted">${cal.fmtDate(date)}</small></li>`).join("")}</ul>` : `<p class="empty small">Brak materiałów.</p>`}
      </aside>
    </div>`;
}

function taskGroups(tasks) {
  const t = cal.today();
  const byDue = (a, b) => (a.task.due < b.task.due ? -1 : 1);
  const open = tasks.filter((x) => !x.task.done);
  const groups = [
    ["Po terminie", open.filter((x) => x.task.due && x.task.due < t).sort(byDue)],
    ["Nadchodzące", open.filter((x) => x.task.due && x.task.due >= t).sort(byDue)],
    ["Bez terminu", open.filter((x) => !x.task.due)],
  ];
  const done = tasks.filter((x) => x.task.done).sort(byDue);
  let html = "";
  for (const [title, list] of groups) {
    if (list.length) html += `<h3>${title} <span class="count">${list.length}</span></h3><ul class="tasks">${list.map((x) => taskItem(x)).join("")}</ul>`;
  }
  if (done.length) html += `<details><summary>Zrobione (${done.length})</summary><ul class="tasks">${done.map((x) => taskItem(x)).join("")}</ul></details>`;
  return html || `<p class="empty">Brak zadań. Dodasz je w formularzu wpisu po zajęciach.</p>`;
}

function viewTasks() {
  return `<h2>Zadania i terminy</h2>${taskGroups(allTasks())}`;
}

function viewGerman() {
  const ids = S.schedule.subjects.filter((s) => s.module === "niemiecki").map((s) => s.id);
  const url = S.settings.deutschAppUrl;
  return `<h2>Niemiecki</h2>
    <div class="card hero">
      <div><b>Deutsch mit Barbara</b><p class="muted small">Quizlety, rodziny wyrazów, powtórki i lekcje z Barbarą. Działa na claude.ai.</p></div>
      ${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Otwórz aplikację ↗</a>` : ""}
    </div>
    <div class="cols">
      <div><h3>Lektorat – wpisy</h3>${timeline(ids)}</div>
      <aside><h3>Zadania z lektoratu</h3>${taskGroups(allTasks((e) => ids.includes(e.subject)))}</aside>
    </div>`;
}

function viewSummary(param) {
  const monday = cal.mondayOf(param || cal.today());
  const sunday = cal.addDays(monday, 6);
  const nextMon = cal.addDays(monday, 7);
  const nextSun = cal.addDays(monday, 13);
  const occs = cal.occurrencesBetween(monday, sunday, S.schedule, S.daysOff);
  const done = occs.filter((o) => statusOf(o) === "zapisane");
  const cancelled = occs.filter((o) => statusOf(o) === "odwolane");
  const missing = occs.filter((o) => statusOf(o) === "brak");
  const allMissing = backlog().length;
  const next = cal.occurrencesBetween(nextMon, nextSun, S.schedule, S.daysOff);
  const nextOff = [];
  for (let d = nextMon; d <= nextSun; d = cal.addDays(d, 1)) {
    const off = cal.dayOff(d, S.daysOff);
    if (off) nextOff.push(`${cal.fmtDay(d, true)} ${cal.fmtDate(d)} – ${esc(off)}`);
  }
  const dueNext = allTasks().filter((x) => !x.task.done && x.task.due && x.task.due <= nextSun).sort((a, b) => (a.task.due < b.task.due ? -1 : 1));

  return `${weekNav("podsumowanie", monday)}
    <h3>Co było <span class="count">${done.length}</span></h3>
    ${done.length ? `<ul class="summary">${done.map((o) => {
      const e = S.entries.get(o.id);
      return `<li><button class="link" data-open="${o.id}"><b>${esc(subject(o.subject).short)}</b> <small class="muted">${cal.fmtDay(o.date, true)}</small></button> ${e.topic ? `– ${esc(e.topic)}` : ""}</li>`;
    }).join("")}</ul>` : `<p class="empty small">Brak wpisów z tego tygodnia.</p>`}
    ${cancelled.length ? `<p class="muted small">Nie odbyły się: ${cancelled.map((o) => esc(subject(o.subject).short)).join(", ")}</p>` : ""}

    <h3>Zaległe <span class="count">${missing.length}</span></h3>
    ${missing.length ? missing.map((o) => occRow(o, true)).join("") : `<p class="empty small">Brak zaległości w tym tygodniu.</p>`}
    ${allMissing > missing.length ? `<p class="small"><a href="#/zalegle">Wszystkie zaległe wpisy: ${allMissing}</a></p>` : ""}

    <h3>Następny tydzień <span class="ab ab-${cal.weekType(nextMon, S.schedule)}">${cal.weekType(nextMon, S.schedule)}</span></h3>
    ${nextOff.length ? `<p class="offline">${nextOff.join("<br>")}</p>` : ""}
    <ul class="summary">${next.filter((o) => !o.off).map((o) => `<li>${cal.fmtDay(o.date, true)} ${o.start} · ${esc(subject(o.subject).short)}</li>`).join("") || `<li class="muted">Brak zajęć.</li>`}</ul>
    <h3>Terminy do ${cal.fmtDate(nextSun)}</h3>
    ${dueNext.length ? `<ul class="tasks">${dueNext.map((x) => taskItem(x)).join("")}</ul>` : `<p class="empty small">Brak terminów.</p>`}`;
}

function viewSettings() {
  const info = store.repoInfo();
  const has = Boolean(store.getToken());
  const where = has ? (store.tokenRemembered() ? "zapamiętany na tym urządzeniu" : "tylko do zamknięcia karty") : "";
  return `<h2>Ustawienia</h2>
    <form id="settingsForm" class="card">
      <p class="muted small">Dane są w <b>prywatnym</b> repozytorium <b>${esc(info.owner || "LOGIN")}/${esc(info.repo)}</b>.
      Strona czyta je i zapisuje tokenem GitHuba (fine-grained, tylko to jedno repozytorium, <i>Contents: Read and write</i>).
      Token zostaje w tej przeglądarce i jest wysyłany wyłącznie do api.github.com. Instrukcja w README.</p>
      <label>Login GitHub<input name="owner" value="${esc(info.owner)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>Repozytorium z danymi<input name="repo" value="${esc(info.repo)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>Gałąź<input name="branch" value="${esc(info.branch)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
      <label>Token ${has ? `<small class="ok">${where}</small>` : ""}
        <input name="token" type="password" placeholder="${has ? "zostaw puste, żeby nie zmieniać" : "github_pat_…"}" autocomplete="off" spellcheck="false"></label>
      <label class="check"><input type="checkbox" name="remember" ${!has || store.tokenRemembered() ? "checked" : ""}> Zapamiętaj na tym urządzeniu (odznacz na cudzym komputerze)</label>
      <div class="row">
        <button class="btn primary" type="submit">Zapisz i połącz</button>
        ${has ? `<button class="btn" type="button" id="checkToken">Sprawdź połączenie</button><button class="btn danger" type="button" id="forgetToken">Wyloguj (usuń token)</button>` : ""}
      </div>
      <p class="small" id="accessInfo">${store.canSave() ? `Połączono z <b>${esc(info.owner)}/${esc(info.repo)}</b>.` : store.isLocal() ? `Tryb lokalny: dane z folderu <code>../uniwersytet-dane/</code>, tylko odczyt.` : `<b class="late">Brak tokenu</b> – bez niego strona nie pokazuje żadnych danych.`}</p>
    </form>`;
}

function viewLocked() {
  return `<div class="card"><h2>🔒 Pamiętnik jest zablokowany</h2>
    <p>Dane są w prywatnym repozytorium. Wklej token w ustawieniach, żeby je zobaczyć.</p></div>${viewSettings()}`;
}

// ---------- formularz wpisu ----------

function taskRow(t = {}) {
  return `<div class="task-row">
    <input name="t_text" placeholder="np. zad. 3.2 ze skryptu" value="${esc(t.text)}">
    <input name="t_due" type="date" value="${esc(t.due)}" aria-label="Termin">
    <select name="t_kind" aria-label="Rodzaj">${TASK_KINDS.map((k) => `<option ${k === (t.kind || "zadanie") ? "selected" : ""}>${k}</option>`).join("")}</select>
    <input name="t_done" type="hidden" value="${t.done ? "1" : ""}">
    <button type="button" class="rm" aria-label="Usuń zadanie">×</button>
  </div>`;
}

function openForm(id) {
  const occ = findOcc(id);
  const sub = subject(occ.subject);
  const e = S.entries.get(id);
  const v = e || {};
  const dlg = $("#dlg");
  dlg.innerHTML = `<form id="entryForm" data-id="${id}">
    <header class="dlg-head">
      <div><b>${esc(sub.name)}</b><div class="muted small">${cal.fmtDay(occ.date)} ${cal.fmtDate(occ.date)} · ${occ.start}–${occ.end} · tydzień ${occ.week}${occ.off ? ` · ${esc(occ.off)}` : ""}</div></div>
      <button type="button" class="rm" data-close aria-label="Zamknij">×</button>
    </header>
    <label>Co było<textarea name="topic" rows="3" placeholder="temat zajęć, krótki opis">${esc(v.topic)}</textarea></label>
    <label>Materiały <small class="muted">jeden w linii: link, plik, rozdział, slajdy</small>
      <textarea name="materials" rows="3">${esc((v.materials || []).join("\n"))}</textarea></label>
    <fieldset><legend>Zadania i terminy</legend>
      <div id="taskRows">${(v.tasks || []).map(taskRow).join("")}</div>
      <button type="button" class="btn small" id="addTask">+ Dodaj zadanie</button>
    </fieldset>
    <label>Uwagi<textarea name="notes" rows="2" placeholder="co było trudne, pytanie do prowadzącego">${esc(v.notes)}</textarea></label>
    <label class="check"><input type="checkbox" name="cancelled" ${v.cancelled ? "checked" : ""}> Zajęcia się nie odbyły (odwołane albo nieobecność)</label>
    ${store.canSave() ? "" : `<p class="warn small">Tryb lokalny bez tokenu. „Zapisz” pobierze plik ${id}.json – wrzuć go do <code>uniwersytet-dane/entries/</code>.</p>`}
    <footer class="dlg-foot">
      ${e && store.canSave() ? `<button type="button" class="btn danger" id="delEntry">Usuń wpis</button>` : "<span></span>"}
      <div class="row"><button type="button" class="btn" data-close>Anuluj</button><button class="btn primary" type="submit">Zapisz</button></div>
    </footer>
  </form>`;
  dlg.showModal();
}

function readForm(form) {
  const id = form.dataset.id;
  const occ = findOcc(id);
  const old = S.entries.get(id) || {};
  const fd = new FormData(form);
  const texts = fd.getAll("t_text"), dues = fd.getAll("t_due"), kinds = fd.getAll("t_kind"), dones = fd.getAll("t_done");
  const tasks = texts
    .map((text, i) => ({ text: text.trim(), due: dues[i] || null, kind: kinds[i], done: dones[i] === "1" }))
    .filter((t) => t.text || t.due);
  const now = new Date().toISOString();
  const entry = {
    subject: occ.subject,
    date: occ.date,
    start: occ.start,
    end: occ.end,
    week: occ.week,
    topic: fd.get("topic").trim(),
    materials: fd.get("materials").split("\n").map((s) => s.trim()).filter(Boolean),
    tasks,
    notes: fd.get("notes").trim(),
    source: old.source || "app",
    createdAt: old.createdAt || now,
    updatedAt: now,
  };
  if (fd.get("cancelled")) entry.cancelled = true;
  return { id, entry };
}

async function saveEntry(id, entry, message) {
  if (!store.canSave()) {
    store.download(`${id}.json`, entry);
    toast("Pobrano plik – wrzuć go do uniwersytet-dane/entries/.");
    return;
  }
  await store.writeJSON(`entries/${id}.json`, entry, message);
  S.entries.set(id, entry);
}

// ---------- obsługa zdarzeń ----------

document.addEventListener("click", async (ev) => {
  const t = ev.target;
  const open = t.closest("[data-open]");
  if (open) return openForm(open.dataset.open);
  if (t.closest("[data-close]")) return $("#dlg").close();
  if (t.id === "addTask") {
    $("#taskRows").insertAdjacentHTML("beforeend", taskRow());
    return $("#taskRows").lastElementChild.querySelector("input").focus();
  }
  if (t.classList.contains("rm") && t.closest(".task-row")) return t.closest(".task-row").remove();
  if (t.id === "delEntry") {
    const id = $("#entryForm").dataset.id;
    if (!confirm("Usunąć ten wpis? Zostanie w historii repozytorium.")) return;
    try {
      await store.deleteFile(`entries/${id}.json`, `wpis: usunięty ${id}`);
      S.entries.delete(id);
      $("#dlg").close();
      toast("Wpis usunięty.");
      render();
    } catch (e) { toast(e.message, "bad"); }
  }
  if (t.id === "forgetToken") {
    store.setToken("");
    clearData();
    toast("Wylogowano – token usunięty z tego urządzenia.");
    reload();
  }
  if (t.id === "checkToken") {
    try {
      const a = await store.checkAccess();
      $("#accessInfo").innerHTML = `Połączenie działa. Repozytorium jest ${a.private ? `<b class="ok">prywatne</b>` : `<b class="late">PUBLICZNE – zmień na prywatne w Settings na GitHubie!</b>`}, zapis ${a.canPush ? "dozwolony" : `<b class="late">niedozwolony</b>`}.`;
    } catch (e) { toast(e.message, "bad"); }
  }
});

document.addEventListener("change", async (ev) => {
  const cb = ev.target.closest("[data-task]");
  if (!cb) return;
  const [entryId, index] = cb.dataset.task.split("|");
  const entry = structuredClone(S.entries.get(entryId));
  const task = entry.tasks[Number(index)];
  task.done = cb.checked;
  entry.updatedAt = new Date().toISOString();
  if (!store.canSave()) {
    cb.checked = !cb.checked;
    return toast("Odhaczanie wymaga tokenu – ustaw go w Ustawieniach.", "bad");
  }
  cb.disabled = true;
  try {
    await saveEntry(entryId, entry, `zadanie: ${task.done ? "zrobione" : "do zrobienia"} – ${task.text.slice(0, 50)}`);
    render();
  } catch (e) {
    cb.checked = !cb.checked;
    cb.disabled = false;
    toast(e.message, "bad");
  }
});

document.addEventListener("submit", async (ev) => {
  const form = ev.target;
  ev.preventDefault();
  if (form.id === "entryForm") {
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    btn.textContent = "Zapisuję…";
    try {
      const { id, entry } = readForm(form);
      await saveEntry(id, entry, `wpis: ${subject(entry.subject).short} ${entry.date}`);
      $("#dlg").close();
      if (store.canSave()) toast("Zapisane ✓", "ok");
      render();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Zapisz";
      toast(e.message, "bad");
    }
  }
  if (form.id === "settingsForm") {
    const fd = new FormData(form);
    store.setRepoInfo({ owner: fd.get("owner").trim(), repo: fd.get("repo").trim(), branch: fd.get("branch").trim() || "main" });
    const token = fd.get("token") || store.getToken();
    store.setToken(token, Boolean(fd.get("remember")));
    toast("Ustawienia zapisane.");
    reload();
  }
});

// ---------- nawigacja i start ----------

const NAV = [
  ["tydzien", "Tydzień"],
  ["zalegle", "Zaległe"],
  ["przedmiot", "Przedmioty"],
  ["zadania", "Zadania"],
  ["niemiecki", "Niemiecki"],
  ["podsumowanie", "Podsumowanie"],
  ["ustawienia", "⚙"],
];

function render() {
  const [route = "tydzien", param = ""] = location.hash.replace(/^#\/?/, "").split("/");
  const late = S.schedule ? backlog().length : 0;
  const openTasks = S.schedule ? allTasks().filter((x) => !x.task.done && x.task.due && x.task.due < cal.today()).length : 0;
  $("#nav").innerHTML = NAV.map(([r, label]) => {
    const n = r === "zalegle" ? late : r === "zadania" ? openTasks : 0;
    return `<a href="#/${r}" class="${r === route ? "on" : ""}" ${r === "ustawienia" ? `aria-label="Ustawienia"` : ""}>${label}${n ? ` <span class="count">${n}</span>` : ""}</a>`;
  }).join("");
  document.querySelector("#nav .on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (S.error) {
    $("#main").innerHTML = `<div class="card"><h2>Nie udało się wczytać danych</h2><p>${esc(S.error)}</p></div>${viewSettings()}`;
    return;
  }
  if (!store.canRead()) {
    $("#main").innerHTML = viewLocked();
    return;
  }
  if (!S.schedule) return;
  const views = { tydzien: viewWeek, zalegle: viewBacklog, przedmiot: viewSubject, zadania: viewTasks, niemiecki: viewGerman, podsumowanie: viewSummary, ustawienia: viewSettings };
  $("#main").innerHTML = (views[route] || viewWeek)(param);
}

async function reload() {
  $("#main").innerHTML = `<p class="empty">Wczytuję…</p>`;
  try {
    await loadAll();
    S.error = null;
  } catch (e) {
    S.error = e.message;
  }
  render();
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});
$("#refresh").addEventListener("click", reload);
reload();
