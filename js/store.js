// Dane: odczyt i zapis plików JSON w PRYWATNYM repozytorium z danymi (domyślnie "uniwersytet-dane").
//
// Strona (publiczna) zawiera tylko kod. Wszystkie dane są w prywatnym repo i czyta się je
// przez API GitHuba z tokenem. Bez tokenu strona nie pokazuje żadnych danych.
// Wyjątek: lokalnie (localhost) bez tokenu czytamy folder ../uniwersytet-dane/ z dysku.

const LS_TOKEN = "uni.token";
const LS_REPO = "uni.repo";
const DEFAULT_DATA_REPO = "uniwersytet-dane";
const LOCAL_BASE = "../uniwersytet-dane/";

function storageGet(store, key) {
  try { return store.getItem(key); } catch { return null; }
}
function storageSet(store, key, value) {
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } catch { /* prywatne okno – trudno */ }
}

// Token: localStorage („zapamiętaj na tym urządzeniu”) albo sessionStorage (do zamknięcia karty).
export function getToken() {
  return storageGet(localStorage, LS_TOKEN) || storageGet(sessionStorage, LS_TOKEN) || "";
}
export function tokenRemembered() {
  return Boolean(storageGet(localStorage, LS_TOKEN));
}
export function setToken(t, remember = true) {
  storageSet(localStorage, LS_TOKEN, "");
  storageSet(sessionStorage, LS_TOKEN, "");
  if (t) storageSet(remember ? localStorage : sessionStorage, LS_TOKEN, t.trim());
}

// Repozytorium z danymi: ustawienia z przeglądarki, a login domyślnie z adresu strony (LOGIN.github.io).
export function repoInfo() {
  let saved = {};
  try { saved = JSON.parse(storageGet(localStorage, LS_REPO) || "{}"); } catch { /* zignoruj */ }
  const host = location.hostname;
  const owner = saved.owner || (host.endsWith(".github.io") ? host.split(".")[0] : "");
  return { owner, repo: saved.repo || DEFAULT_DATA_REPO, branch: saved.branch || "main" };
}
export function setRepoInfo(info) {
  storageSet(localStorage, LS_REPO, JSON.stringify(info));
}

let REPO = repoInfo();
export function init() {
  REPO = repoInfo();
  return REPO;
}

export function isLocal() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}
export function canSave() {
  return Boolean(getToken() && REPO.owner && REPO.repo);
}
// Czy w ogóle da się wczytać dane (z GitHuba albo z dysku przy pracy lokalnej).
export function canRead() {
  return canSave() || isLocal();
}

function apiUrl(path) {
  return `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/${path}`;
}
function headers(extra = {}) {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${getToken()}`, ...extra };
}
async function fail(res, what) {
  let msg = "";
  try { msg = (await res.json()).message || ""; } catch { /* brak treści */ }
  const hint =
    res.status === 401 ? " – zły albo wygasły token" :
    res.status === 403 || res.status === 404 ? ` – token nie ma dostępu do repozytorium ${REPO.owner}/${REPO.repo}` : "";
  throw new Error(`${what}: ${res.status} ${msg}${hint}`);
}

// Odczyt jednego pliku JSON (ścieżka względem repo z danymi, np. "schedule.json"). null, gdy brak pliku.
export async function readJSON(path) {
  const res = canSave()
    ? await fetch(apiUrl(`contents/${path}?ref=${REPO.branch}`), { headers: headers({ Accept: "application/vnd.github.raw+json" }), cache: "no-store" })
    : await fetch(LOCAL_BASE + path, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, `Odczyt ${path}`);
  return res.json();
}

// Lista plików wpisów ("entries/….json").
export async function listEntryFiles() {
  if (canSave()) {
    const res = await fetch(apiUrl(`git/trees/${REPO.branch}?recursive=1`), { headers: headers(), cache: "no-store" });
    if (res.status === 409) return []; // puste repozytorium
    if (!res.ok) await fail(res, "Lista wpisów");
    const data = await res.json();
    return data.tree.map((t) => t.path).filter((p) => p.startsWith("entries/") && p.endsWith(".json"));
  }
  // lokalnie: listing katalogu z python3 -m http.server
  const res = await fetch(LOCAL_BASE + "entries/", { cache: "no-store" });
  if (!res.ok) return [];
  const html = await res.text();
  return [...html.matchAll(/href="([^"/]+\.json)"/g)].map((m) => `entries/${decodeURIComponent(m[1])}`);
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function currentSha(path) {
  const res = await fetch(apiUrl(`contents/${path}?ref=${REPO.branch}`), { headers: headers(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, `Odczyt ${path}`);
  return (await res.json()).sha;
}

// Zapis (utworzenie albo nadpisanie) pliku JSON jednym commitem.
export async function writeJSON(path, obj, message) {
  const sha = await currentSha(path);
  const body = { message, branch: REPO.branch, content: toBase64(JSON.stringify(obj, null, 2) + "\n") };
  if (sha) body.sha = sha;
  const res = await fetch(apiUrl(`contents/${path}`), { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) await fail(res, "Zapis");
}

export async function deleteFile(path, message) {
  const sha = await currentSha(path);
  if (!sha) return;
  const res = await fetch(apiUrl(`contents/${path}`), {
    method: "DELETE",
    headers: headers(),
    body: JSON.stringify({ message, sha, branch: REPO.branch }),
  });
  if (!res.ok) await fail(res, "Usuwanie");
}

// Sprawdza token: czy widzi repo z danymi i czy jest ono prywatne.
export async function checkAccess() {
  const res = await fetch(apiUrl(""), { headers: headers(), cache: "no-store" });
  if (!res.ok) await fail(res, "Połączenie");
  const repo = await res.json();
  return { private: repo.private, canPush: Boolean(repo.permissions && repo.permissions.push) };
}

// Awaryjnie, bez tokenu (tylko lokalnie): pobierz plik i wrzuć go ręcznie do entries/.
export function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
