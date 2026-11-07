const SHEET_ID = "1NsClrqn1jNee1gEn8dsAqBagXyEdfVPv_rWuWrtM0Tg";
const QUESTIONS_URL = "https://script.google.com/macros/s/AKfycbw-tuMZb3oCR-_KwhXPUWmvNxbUyV3-OUc367QyxklkdDcVJ9h4j8-OIOYVq_GFfucgoA/exec";
const CODES_URL = "https://script.google.com/macros/s/AKfycby1V6xzOG7jhi9cPxH7FYejWO0jt4-5rbxnWSP1vlCDZqHdE3TzwWhnhl-dEQrGcWHHBA/exec";
const DEFAULT_START = { h: 18, min: 0 };
const DEFAULT_DURATION_MIN = 60;
const TIMER_INTERVAL_MS = 30 * 1000;
const ASK_MAX_LEN = 500;
const ASK_COOLDOWN_MS = 30 * 1000;
const CODE_MAX_LEN = 40;
const REFRESH_AFTER_MS = 5 * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

const $ = (id) => document.getElementById(id);
const state = { events: [] };
let timerId = null;
let lastLoad = Date.now();

function pad(n) {
  return String(n).padStart(2, "0");
}

function setGreeting() {
  const hour = new Date().getHours();
  let greeting;
  if (hour >= 6 && hour < 12) greeting = "Слава Ісусу Христу! Благословенного ранку!";
  else if (hour >= 12 && hour < 18) greeting = "Слава Ісусу Христу! Спокійного дня!";
  else if (hour >= 18 && hour <= 23) greeting = "Слава Ісусу Христу! Затишного вечора!";
  else greeting = "Слава Ісусу Христу! Мирної ночі!";
  $("greeting-text").textContent = greeting;
}

function parseDate(value) {
  const s = String(value || "").trim();
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let y, m, d;
  if (match) {
    y = +match[1]; m = +match[2]; d = +match[3];
  } else {
    match = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (!match) return null;
    d = +match[1]; m = +match[2]; y = +match[3];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function parseTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  const h = +match[1];
  const min = +match[2];
  if (h > 23 || min > 59) return null;
  return { h, min };
}

function resolveEnd(item, date, start) {
  const endTime = parseTime(item.end);
  if (endTime) {
    const end = new Date(date.y, date.m - 1, date.d, endTime.h, endTime.min, 0);
    if (end > start) return end;
  }
  const minutes = parseInt(item.duration, 10);
  const length = minutes > 0 ? minutes : DEFAULT_DURATION_MIN;
  return new Date(start.getTime() + length * 60000);
}

function buildEvent(item) {
  const date = parseDate(item.date);
  if (!date) return null;
  const time = parseTime(item.time);
  const t = time || DEFAULT_START;
  const start = new Date(date.y, date.m - 1, date.d, t.h, t.min, 0);
  if (isNaN(start.getTime())) return null;
  return {
    title: String(item.title || "").trim() || "Зустріч молодіжки",
    location: String(item.location || "").trim(),
    note: String(item.note || "").trim(),
    date,
    time,
    start,
    end: resolveEnd(item, date, start)
  };
}

function formatWhen(ev) {
  const day = `${ev.date.d} ${MONTHS[ev.date.m - 1]}`;
  return ev.time ? `${day} · ${pad(ev.time.h)}:${pad(ev.time.min)}` : day;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    return /^https?:$/.test(url.protocol) ? url.href : "#";
  } catch (e) {
    return "#";
  }
}

function makeIcon(id, cls) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `icon ${cls}`);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

function buildRow(ev) {
  const row = document.createElement("div");
  row.className = "schedule-item";

  const when = document.createElement("div");
  when.className = "item-when";
  when.appendChild(makeIcon("i-calendar", "list-icon"));
  when.appendChild(document.createTextNode(formatWhen(ev)));

  const title = document.createElement("div");
  title.className = "item-title";
  title.textContent = ev.title;

  row.append(when, title);

  if (ev.location) {
    const loc = document.createElement("div");
    loc.className = "item-loc";
    loc.appendChild(makeIcon("i-pin", "list-icon"));
    loc.appendChild(document.createTextNode(ev.location));
    row.appendChild(loc);
  }
  return row;
}

async function loadSheet(name) {
  const key = `umh-sheet-${name}`;
  try {
    const res = await fetch(CODES_URL);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("bad response");
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    return data;
  } catch (e) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (err) {}
    return null;
  }
}

function showFocus() {
  $("focus-skeleton").hidden = true;
  $("focus-content").hidden = false;
}

function showMessage(title, kind) {
  showFocus();
  $("next-title").textContent = title;
  $("event-details").hidden = true;
  $("next-note-box").hidden = true;
  $("next-empty").hidden = kind !== "empty";
  $("next-error").hidden = kind !== "error";
  $("upcoming-card").hidden = true;
  $("today-badge").hidden = true;
  $("focus-card").classList.remove("is-today");
}

function updateTimer(ev) {
  if (timerId) clearInterval(timerId);
  const el = $("next-timer");

  function tick() {
    const now = new Date();
    const today = ev.start.toDateString() === now.toDateString();
    $("today-badge").hidden = !today;
    $("focus-card").classList.toggle("is-today", today);
    if (now >= ev.end) {
      clearInterval(timerId);
      renderSchedule();
      return;
    }
    if (now >= ev.start) {
      el.textContent = "Зустріч уже розпочалася!";
      return;
    }
    const mins = Math.floor((ev.start - now) / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const rest = mins % 60;
    const parts = [];
    if (days > 0) {
      parts.push(`${days} дн.`);
      if (hours > 0) parts.push(`${hours} год.`);
    } else {
      if (hours > 0) parts.push(`${hours} год.`);
      if (rest > 0) parts.push(`${rest} хв.`);
    }
    el.textContent = parts.length ? `До зустрічі: ${parts.join(" ")}` : "До зустрічі: менше хвилини!";
  }

  tick();
  timerId = setInterval(tick, TIMER_INTERVAL_MS);
}

function renderSchedule() {
  const now = new Date();
  const upcoming = state.events.filter((ev) => ev.end > now).sort((a, b) => a.start - b.start);

  if (!upcoming.length) {
    if (timerId) clearInterval(timerId);
    showMessage("Найближчих зустрічей поки немає", "empty");
    return;
  }

  const next = upcoming[0];
  showFocus();
  $("next-title").textContent = next.title;
  $("event-details").hidden = false;
  $("next-empty").hidden = true;
  $("next-error").hidden = true;

  const loc = $("next-loc");
  loc.textContent = next.location;
  loc.parentElement.hidden = !next.location;

  $("next-note").textContent = next.note;
  $("next-note-box").hidden = !next.note;

  updateTimer(next);

  const list = $("schedule-list");
  list.replaceChildren();
  const others = upcoming.slice(1, 3);
  others.forEach((ev) => list.appendChild(buildRow(ev)));
  $("upcoming-card").hidden = others.length === 0;
}

async function loadSchedule() {
  const raw = await loadSheet("Schedule");
  if (!raw) {
    showMessage("Не вдалося завантажити розклад", "error");
    return;
  }
  state.events = raw.map(buildEvent).filter(Boolean);
  renderSchedule();
}

async function loadProject() {
  const projects = await loadSheet("Projects");
  if (!projects) return;
  const p = projects[0];
  if (!p || String(p.active).trim().toUpperCase() !== "TRUE") {
    $("project-card").hidden = true;
    return;
  }
  $("project-badge").textContent = p.badge || "Анонс";
  $("project-title").textContent = p.title || "";
  $("project-desc").textContent = p.description || "";
  const btn = $("project-btn");
  btn.textContent = p.button_text || "Дізнатися більше";
  btn.href = safeUrl(p.button_url);
  $("project-card").hidden = false;
}

function initTheme() {
  const root = document.documentElement;
  const btn = $("theme-toggle");
  const meta = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    root.dataset.theme = theme;
    btn.setAttribute("aria-label", theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0F2236" : "#2473B8");
  }

  apply(root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  btn.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem("umh-theme", next); } catch (e) {}
  });
}

function initToggle() {
  const toggle = $("toggle-schedule-btn");
  const wrap = $("schedule-wrap");
  toggle.addEventListener("click", () => {
    const open = wrap.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    wrap.inert = !open;
    toggle.textContent = open ? "Сховати наступні зустрічі" : "Показати наступні зустрічі";
  });
}

function initAskForm() {
  const form = $("ask-form");
  const input = $("ask-input");
  const trap = $("ask-website");
  const btn = $("ask-btn");
  const status = $("ask-status");
  let statusTimer = null;

  function showStatus(text) {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 6000);
  }

  function lastSent() {
    try { return Number(localStorage.getItem("umh-last-ask")) || 0; } catch (e) { return 0; }
  }

  function markSent() {
    try { localStorage.setItem("umh-last-ask", String(Date.now())); } catch (e) {}
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, ASK_MAX_LEN);
    if (!text) return;

    if (trap.value) {
      form.reset();
      showStatus("Намір надіслано успішно. Дякуємо 🕊️");
      return;
    }
    if (Date.now() - lastSent() < ASK_COOLDOWN_MS) {
      showStatus("Зачекай хвилинку перед наступним наміром.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Надсилаємо...";

    try {
      await fetch(QUESTIONS_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ question: text })
      });
      markSent();
      form.reset();
      showStatus("Намір надіслано успішно. Дякуємо 🕊️");
    } catch (err) {
      showStatus("Сталася помилка. Спробуйте ще раз пізніше.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Надіслати анонімно";
    }
  });
}

function initSecret() {
  const dialog = $("secret-dialog");
  const form = $("secret-form");
  const input = $("secret-input");
  const btn = $("secret-btn");
  const result = $("secret-result");
  const logo = document.querySelector(".logo-wrap");
  let taps = 0;
  let tapTimer = null;

  function openDialog() {
    result.textContent = "";
    if (!dialog.open) dialog.showModal();
    input.focus();
  }

  async function check(code) {
    btn.disabled = true;
    result.textContent = "Перевіряємо...";
    try {
      const res = await fetch(`${CODES_URL}?code=${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      if (data.ok) result.textContent = data.message || "Код прийнято 🕊️";
      else if (data.limited) result.textContent = "Забагато спроб. Спробуй за хвилину.";
      else result.textContent = "Такого коду немає. Спробуй ще раз.";
    } catch (err) {
      result.textContent = "Не вдалося перевірити. Спробуй пізніше.";
    } finally {
      btn.disabled = false;
    }
  }

  logo.addEventListener("click", () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = 0; }, 2000);
    if (taps >= 5) {
      taps = 0;
      openDialog();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.trim().slice(0, CODE_MAX_LEN);
    if (code) check(code);
  });

  $("secret-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  const urlCode = (new URLSearchParams(location.search).get("code") || "").trim().slice(0, CODE_MAX_LEN);
  if (urlCode) {
    input.value = urlCode;
    openDialog();
    check(urlCode);
    history.replaceState(null, "", location.pathname + location.hash);
  }
}

initTheme();
setGreeting();
$("empty-instagram").href = $("instagram-link").href;
initToggle();
initAskForm();
initSecret();
loadSchedule();
loadProject();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (Date.now() - lastLoad > REFRESH_AFTER_MS) {
    lastLoad = Date.now();
    loadSchedule();
    loadProject();
  } else if (state.events.length) {
    renderSchedule();
  }
});