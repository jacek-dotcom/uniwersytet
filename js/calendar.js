// Kalendarz: daty, tydzień A/B, dni wolne i rozwinięcie planu w konkretne zajęcia.
// Daty w całej aplikacji to teksty "RRRR-MM-DD" (czas lokalny, bez stref).

export function iso(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parse(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  return iso(new Date());
}

export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// 1 = poniedziałek … 7 = niedziela
export function weekday(s) {
  return ((parse(s).getDay() + 6) % 7) + 1;
}

export function mondayOf(s) {
  return addDays(s, 1 - weekday(s));
}

function weeksBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / (7 * 86400000));
}

// Typ tygodnia ("A" albo "B"). Liczymy od weekAStart; wpis w weekOverrides
// ustawia typ danego tygodnia i od niego naprzemienność liczy się dalej.
export function weekType(date, schedule) {
  const mon = mondayOf(date);
  let base = { weekOf: mondayOf(schedule.weekAStart), type: "A" };
  const overrides = [...(schedule.weekOverrides || [])].sort((x, y) => (x.weekOf < y.weekOf ? -1 : 1));
  for (const o of overrides) {
    if (mondayOf(o.weekOf) <= mon) base = { weekOf: mondayOf(o.weekOf), type: o.type };
  }
  const odd = Math.abs(weeksBetween(base.weekOf, mon)) % 2 === 1;
  if (!odd) return base.type;
  return base.type === "A" ? "B" : "A";
}

// Nazwa dnia wolnego albo null.
export function dayOff(date, daysOff) {
  const hit = (daysOff.days || []).find((d) => d.date === date);
  if (hit) return hit.name || "Dzień wolny";
  const br = daysOff.christmasBreak || {};
  if (br.from && br.to && date >= br.from && date <= br.to) return "Przerwa świąteczna";
  return null;
}

export function inSemester(date, schedule, daysOff) {
  if (schedule.validFrom && date < schedule.validFrom) return false;
  if (daysOff.semesterEnd && date > daysOff.semesterEnd) return false;
  return true;
}

// Wszystkie zajęcia danego dnia. id zajęć = id wpisu = "RRRR-MM-DD-przedmiot".
export function occurrencesOn(date, schedule, daysOff) {
  if (!inSemester(date, schedule, daysOff)) return [];
  const week = weekType(date, schedule);
  const off = dayOff(date, daysOff);
  const wd = weekday(date);
  return schedule.slots
    .filter((s) => s.day === wd && s.weeks.includes(week))
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((s) => ({ id: `${date}-${s.subject}`, date, week, off, subject: s.subject, start: s.start, end: s.end }));
}

export function occurrencesBetween(from, to, schedule, daysOff) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(...occurrencesOn(d, schedule, daysOff));
  return out;
}

export function hasEnded(occ, now = new Date()) {
  const [h, m] = occ.end.split(":").map(Number);
  const end = parse(occ.date);
  end.setHours(h, m);
  return now >= end;
}

// Status zajęć: "wolne" | "zapisane" | "odwolane" | "brak" | "minelo" | "zaplanowane"
export function status(occ, entry, subject, now = new Date()) {
  if (occ.off) return "wolne";
  if (entry) return entry.cancelled ? "odwolane" : "zapisane";
  if (hasEnded(occ, now)) return subject && subject.requiresEntry === false ? "minelo" : "brak";
  return "zaplanowane";
}

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const DAYS = ["", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
const DAYS_SHORT = ["", "pon", "wt", "śr", "czw", "pt", "sob", "nd"];

export function fmtDate(s) {
  const d = parse(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtDay(s, short = false) {
  return (short ? DAYS_SHORT : DAYS)[weekday(s)];
}

export function fmtRange(from, to) {
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}
