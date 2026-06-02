const defaultColors = [
  "#2f80ed",
  "#eb5757",
  "#27ae60",
  "#f2994a",
  "#9b51e0",
  "#00a8a8",
  "#f2c94c",
  "#8d6e63",
  "#1f2937",
  "#d946ef",
  "#84cc16",
  "#ef4444"
];

const storageKey = "bgtimer.session.v1";

const state = {
  players: [],
  activeIndex: 0,
  turnSeconds: 300,
  remainingSeconds: 300,
  running: false,
  intervalId: null,
  soundEnabled: true
};

const elements = {
  activeName: document.querySelector("#activeName"),
  activeSwatch: document.querySelector("#activeSwatch"),
  timeDisplay: document.querySelector("#timeDisplay"),
  timerPanel: document.querySelector(".timer-panel"),
  settingsView: document.querySelector("#settingsView"),
  menuBtn: document.querySelector("#menuBtn"),
  timerMenu: document.querySelector("#timerMenu"),
  settingsBtn: document.querySelector("#settingsBtn"),
  backToTimerBtn: document.querySelector("#backToTimerBtn"),
  previousBtn: document.querySelector("#previousBtn"),
  nextBtn: document.querySelector("#nextBtn"),
  nextStartBtn: document.querySelector("#nextStartBtn"),
  toggleBtn: document.querySelector("#toggleBtn"),
  resetTurnBtn: document.querySelector("#resetTurnBtn"),
  resetAllBtn: document.querySelector("#resetAllBtn"),
  soundBtn: document.querySelector("#soundBtn"),
  playerCount: document.querySelector("#playerCount"),
  minutesInput: document.querySelector("#minutesInput"),
  secondsInput: document.querySelector("#secondsInput"),
  applyTimeBtn: document.querySelector("#applyTimeBtn"),
  playersList: document.querySelector("#playersList")
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function saveSession() {
  const session = {
    players: state.players,
    activeIndex: state.activeIndex,
    turnSeconds: state.turnSeconds,
    remainingSeconds: state.remainingSeconds,
    soundEnabled: state.soundEnabled
  };

  localStorage.setItem(storageKey, JSON.stringify(session));
}

function loadSession() {
  try {
    const rawSession = localStorage.getItem(storageKey);
    if (!rawSession) return false;

    const session = JSON.parse(rawSession);
    if (!Array.isArray(session.players) || session.players.length === 0) return false;

    state.players = session.players.slice(0, 12).map((player, index) => ({
      name: String(player.name || `Player ${index + 1}`).slice(0, 28),
      color: /^#[0-9a-f]{6}$/i.test(player.color) ? player.color : defaultColors[index % defaultColors.length]
    }));
    state.activeIndex = clamp(Number(session.activeIndex) || 0, 0, state.players.length - 1);
    state.turnSeconds = clamp(Number(session.turnSeconds) || 300, 1, 5940);
    state.remainingSeconds = Number.isFinite(Number(session.remainingSeconds))
      ? Number(session.remainingSeconds)
      : state.turnSeconds;
    state.soundEnabled = session.soundEnabled !== false;

    elements.playerCount.value = String(state.players.length);
    elements.minutesInput.value = String(Math.floor(state.turnSeconds / 60));
    elements.secondsInput.value = String(state.turnSeconds % 60);
    return true;
  } catch {
    return false;
  }
}

function formatTime(totalSeconds) {
  const isNegative = totalSeconds < 0;
  const absoluteSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  return `${isNegative ? "-" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playExpiredSound() {
  if (!state.soundEnabled) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.setValueAtTime(520, context.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.38);
  oscillator.addEventListener("ended", () => context.close());
}

function createPlayers(count) {
  const previous = state.players;

  state.players = Array.from({ length: count }, (_, index) => {
    return previous[index] || {
      name: `Player ${index + 1}`,
      color: defaultColors[index % defaultColors.length]
    };
  });

  state.activeIndex = clamp(state.activeIndex, 0, state.players.length - 1);
  saveSession();
}

function renderPlayers() {
  elements.playersList.innerHTML = "";

  state.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = `player-row${index === state.activeIndex ? " active" : ""}`;

    const nameLabel = document.createElement("label");
    nameLabel.innerHTML = `<span>Player ${index + 1} name</span>`;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = player.name;
    nameInput.maxLength = 28;
    nameInput.addEventListener("input", () => {
      player.name = nameInput.value.trim() || `Player ${index + 1}`;
      saveSession();
      renderTimer();
    });

    const colorLabel = document.createElement("label");
    colorLabel.innerHTML = "<span>Color</span>";

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-input";
    colorInput.value = player.color;
    colorInput.addEventListener("input", () => {
      player.color = colorInput.value;
      saveSession();
      renderTimer();
    });

    nameLabel.appendChild(nameInput);
    colorLabel.appendChild(colorInput);
    row.append(nameLabel, colorLabel);
    elements.playersList.appendChild(row);
  });
}

function renderTimer() {
  const activePlayer = state.players[state.activeIndex];
  elements.activeName.textContent = activePlayer.name;
  elements.activeSwatch.style.backgroundColor = activePlayer.color;
  elements.timeDisplay.textContent = formatTime(state.remainingSeconds);
  elements.timeDisplay.classList.toggle("expired", state.remainingSeconds <= 0);
  elements.toggleBtn.textContent = state.running ? "Pause" : "Start";
  elements.soundBtn.textContent = state.soundEnabled ? "Sound On" : "Sound Off";
}

function render() {
  renderPlayers();
  renderTimer();
}

function stopTimer() {
  state.running = false;
  clearInterval(state.intervalId);
  state.intervalId = null;
  saveSession();
  renderTimer();
}

function startTimer() {
  clearInterval(state.intervalId);
  state.running = true;
  state.intervalId = window.setInterval(() => {
    const previousSeconds = state.remainingSeconds;
    state.remainingSeconds -= 1;

    if (previousSeconds === 1 && state.remainingSeconds === 0) {
      playExpiredSound();
    }

    saveSession();
    renderTimer();
  }, 1000);

  renderTimer();
}

function moveTurn(offset) {
  stopTimer();
  state.activeIndex = (state.activeIndex + offset + state.players.length) % state.players.length;
  state.remainingSeconds = state.turnSeconds;
  saveSession();
  render();
}

function nextPlayerAndStart() {
  state.activeIndex = (state.activeIndex + 1) % state.players.length;
  state.remainingSeconds = state.turnSeconds;
  saveSession();
  render();
  startTimer();
}

function closeMenu() {
  elements.timerMenu.hidden = true;
  elements.menuBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  const shouldOpen = elements.timerMenu.hidden;
  elements.timerMenu.hidden = !shouldOpen;
  elements.menuBtn.setAttribute("aria-expanded", String(shouldOpen));
}

function showTimerView() {
  elements.timerPanel.hidden = false;
  elements.settingsView.hidden = true;
  closeMenu();

  if (window.location.hash === "#settings") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function showSettingsView() {
  elements.timerPanel.hidden = true;
  elements.settingsView.hidden = false;
  closeMenu();

  if (window.location.hash !== "#settings") {
    history.replaceState(null, "", "#settings");
  }
}

function syncViewFromHash() {
  if (window.location.hash === "#settings") {
    showSettingsView();
  } else {
    showTimerView();
  }
}

function applyTurnTime() {
  const minutes = clamp(Number(elements.minutesInput.value) || 0, 0, 99);
  const seconds = clamp(Number(elements.secondsInput.value) || 0, 0, 59);
  const total = Math.max(1, minutes * 60 + seconds);

  elements.minutesInput.value = String(minutes);
  elements.secondsInput.value = String(seconds);
  state.turnSeconds = total;
  state.remainingSeconds = total;
  stopTimer();
  saveSession();
  renderTimer();
}

elements.toggleBtn.addEventListener("click", () => {
  if (state.running) {
    stopTimer();
  } else {
    startTimer();
  }
});

elements.previousBtn.addEventListener("click", () => moveTurn(-1));
elements.nextBtn.addEventListener("click", () => moveTurn(1));
elements.nextStartBtn.addEventListener("click", nextPlayerAndStart);
elements.settingsBtn.addEventListener("click", showSettingsView);
elements.backToTimerBtn.addEventListener("click", showTimerView);
window.addEventListener("hashchange", syncViewFromHash);

elements.menuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleMenu();
});

document.addEventListener("click", (event) => {
  if (!elements.timerMenu.hidden && !event.target.closest(".menu-wrap")) {
    closeMenu();
  }
});

elements.resetTurnBtn.addEventListener("click", () => {
  stopTimer();
  state.remainingSeconds = state.turnSeconds;
  saveSession();
  renderTimer();
  closeMenu();
});

elements.resetAllBtn.addEventListener("click", () => {
  stopTimer();
  state.activeIndex = 0;
  state.remainingSeconds = state.turnSeconds;
  saveSession();
  render();
  closeMenu();
});

elements.soundBtn.addEventListener("click", () => {
  state.soundEnabled = !state.soundEnabled;
  saveSession();
  renderTimer();
  closeMenu();
});

elements.playerCount.addEventListener("change", () => {
  const count = clamp(Number(elements.playerCount.value) || 1, 1, 12);
  elements.playerCount.value = String(count);
  createPlayers(count);
  stopTimer();
  render();
});

elements.applyTimeBtn.addEventListener("click", applyTurnTime);

if (!loadSession()) {
  createPlayers(Number(elements.playerCount.value));
}
render();
syncViewFromHash();
