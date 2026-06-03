import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

type Player = {
  name: string;
  color: string;
  passed: boolean;
};

type Session = {
  players: Player[];
  activeIndex: number;
  roundStartIndex: number;
  turnSeconds: number;
  remainingSeconds: number;
  soundEnabled: boolean;
  passingEnabled: boolean;
  rotateStartPlayer: boolean;
};

type StoredPlayer = {
  name?: unknown;
  color?: unknown;
  passed?: unknown;
};

type StoredSession = {
  players?: unknown;
  activeIndex?: unknown;
  roundStartIndex?: unknown;
  turnSeconds?: unknown;
  remainingSeconds?: unknown;
  soundEnabled?: unknown;
  passingEnabled?: unknown;
  rotateStartPlayer?: unknown;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createDefaultPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Player ${index + 1}`,
    color: defaultColors[index % defaultColors.length],
    passed: false
  }));
}

function loadSession(): Session | null {
  try {
    const rawSession = localStorage.getItem(storageKey);
    if (!rawSession) return null;

    const session = JSON.parse(rawSession) as StoredSession;
    if (!Array.isArray(session.players) || session.players.length === 0) return null;

    const players = session.players.slice(0, 12).map((player: StoredPlayer, index: number) => ({
      name: String(player.name || `Player ${index + 1}`).slice(0, 28),
      color:
        typeof player.color === "string" && /^#[0-9a-f]{6}$/i.test(player.color)
          ? player.color
          : defaultColors[index % defaultColors.length],
      passed: Boolean(player.passed)
    }));

    const turnSeconds = clamp(Number(session.turnSeconds) || 300, 1, 5940);

    return {
      players,
      activeIndex: clamp(Number(session.activeIndex) || 0, 0, players.length - 1),
      roundStartIndex: clamp(Number(session.roundStartIndex) || 0, 0, players.length - 1),
      turnSeconds,
      remainingSeconds: Number.isFinite(Number(session.remainingSeconds)) ? Number(session.remainingSeconds) : turnSeconds,
      soundEnabled: session.soundEnabled !== false,
      passingEnabled: session.passingEnabled !== false,
      rotateStartPlayer: session.rotateStartPlayer !== false
    };
  } catch {
    return null;
  }
}

function formatTime(totalSeconds: number): string {
  const isNegative = totalSeconds < 0;
  const absoluteSeconds = Math.abs(totalSeconds);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  return `${isNegative ? "-" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playExpiredSound(soundEnabled: boolean) {
  if (!soundEnabled) return;

  const AudioContextConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const context = new AudioContextConstructor();
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

export default function App() {
  const initialSession = loadSession();
  const initialPlayers = initialSession?.players || createDefaultPlayers(4);

  const [players, setPlayers] = createSignal(initialPlayers);
  const [activeIndex, setActiveIndex] = createSignal(initialSession?.activeIndex || 0);
  const [roundStartIndex, setRoundStartIndex] = createSignal(initialSession?.roundStartIndex || 0);
  const [turnSeconds, setTurnSeconds] = createSignal(initialSession?.turnSeconds || 300);
  const [remainingSeconds, setRemainingSeconds] = createSignal(initialSession?.remainingSeconds ?? 300);
  const [running, setRunning] = createSignal(false);
  const [soundEnabled, setSoundEnabled] = createSignal(initialSession?.soundEnabled ?? true);
  const [passingEnabled, setPassingEnabled] = createSignal(initialSession?.passingEnabled ?? true);
  const [rotateStartPlayer, setRotateStartPlayer] = createSignal(initialSession?.rotateStartPlayer ?? true);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(window.location.hash === "#settings");
  const [minutesInput, setMinutesInput] = createSignal(String(Math.floor((initialSession?.turnSeconds || 300) / 60)));
  const [secondsInput, setSecondsInput] = createSignal(String((initialSession?.turnSeconds || 300) % 60));

  const activePlayer = createMemo(() => players()[activeIndex()] || players()[0]);
  const hasEligiblePlayer = createMemo(() => players().some((player) => !player.passed));
  const timerDisabled = createMemo(() => !activePlayer() || activePlayer().passed || !hasEligiblePlayer());

  function saveSession() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        players: players(),
        activeIndex: activeIndex(),
        roundStartIndex: roundStartIndex(),
        turnSeconds: turnSeconds(),
        remainingSeconds: remainingSeconds(),
        soundEnabled: soundEnabled(),
        passingEnabled: passingEnabled(),
        rotateStartPlayer: rotateStartPlayer()
      })
    );
  }

  createEffect(() => {
    if (passingEnabled()) return;

    setPlayers((currentPlayers) => {
      if (!currentPlayers.some((player) => player.passed)) return currentPlayers;
      return currentPlayers.map((player) => ({ ...player, passed: false }));
    });
  });

  createEffect(saveSession);

  createEffect(() => {
    if (!running()) return;

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((previousSeconds) => {
        const nextSeconds = previousSeconds - 1;
        if (previousSeconds === 1 && nextSeconds === 0) {
          playExpiredSound(soundEnabled());
        }
        return nextSeconds;
      });
    }, 1000);

    onCleanup(() => window.clearInterval(intervalId));
  });

  onMount(() => {
    const syncViewFromHash = () => {
      setSettingsOpen(window.location.hash === "#settings");
      setMenuOpen(false);
    };

    const closeMenuFromPageClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest(".menu-wrap")) setMenuOpen(false);
    };

    window.addEventListener("hashchange", syncViewFromHash);
    document.addEventListener("click", closeMenuFromPageClick);

    onCleanup(() => {
      window.removeEventListener("hashchange", syncViewFromHash);
      document.removeEventListener("click", closeMenuFromPageClick);
    });
  });

  function stopTimer() {
    setRunning(false);
  }

  function startTimer() {
    if (timerDisabled()) return;
    setRunning(true);
  }

  function findEligiblePlayerIndex(startIndex: number, offset: number): number {
    if (!passingEnabled()) {
      return (startIndex + offset + players().length) % players().length;
    }

    if (!players().some((player) => !player.passed)) return -1;

    let index = startIndex;
    for (let attempts = 0; attempts < players().length; attempts += 1) {
      index = (index + offset + players().length) % players().length;
      if (!players()[index]?.passed) return index;
    }

    return -1;
  }

  function moveTurn(offset: number) {
    stopTimer();
    const nextIndex = findEligiblePlayerIndex(activeIndex(), offset);
    if (nextIndex === -1) return;

    setActiveIndex(nextIndex);
    setRemainingSeconds(turnSeconds());
  }

  function nextPlayerAndStart() {
    const nextIndex = findEligiblePlayerIndex(activeIndex(), 1);
    if (nextIndex === -1) {
      stopTimer();
      return;
    }

    setActiveIndex(nextIndex);
    setRemainingSeconds(turnSeconds());
    setRunning(true);
  }

  function passForRound() {
    if (!passingEnabled()) return;

    stopTimer();
    setPlayers((currentPlayers) =>
      currentPlayers.map((player, index) => (index === activeIndex() ? { ...player, passed: true } : player))
    );

    const nextIndex = findEligiblePlayerIndex(activeIndex(), 1);
    setRemainingSeconds(turnSeconds());

    if (nextIndex !== -1) {
      setActiveIndex(nextIndex);
      setRunning(true);
    }
  }

  function nextRound() {
    stopTimer();
    setPlayers((currentPlayers) => currentPlayers.map((player) => ({ ...player, passed: false })));
    const nextStartIndex = rotateStartPlayer() ? (roundStartIndex() + 1) % players().length : roundStartIndex();
    setRoundStartIndex(nextStartIndex);
    setActiveIndex(nextStartIndex);
    setRemainingSeconds(turnSeconds());
  }

  function showTimerView() {
    setSettingsOpen(false);
    setMenuOpen(false);
    if (window.location.hash === "#settings") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  function showSettingsView() {
    setSettingsOpen(true);
    setMenuOpen(false);
    if (window.location.hash !== "#settings") {
      history.replaceState(null, "", "#settings");
    }
  }

  function applyTurnTime() {
    const minutes = clamp(Number(minutesInput()) || 0, 0, 99);
    const seconds = clamp(Number(secondsInput()) || 0, 0, 59);
    const total = Math.max(1, minutes * 60 + seconds);

    setMinutesInput(String(minutes));
    setSecondsInput(String(seconds));
    setTurnSeconds(total);
    setRemainingSeconds(total);
    stopTimer();
  }

  function resetTurn() {
    stopTimer();
    setRemainingSeconds(turnSeconds());
    setMenuOpen(false);
  }

  function resetAll() {
    stopTimer();
    setActiveIndex(0);
    setRoundStartIndex(0);
    setPlayers((currentPlayers) => currentPlayers.map((player) => ({ ...player, passed: false })));
    setRemainingSeconds(turnSeconds());
    setMenuOpen(false);
  }

  function updatePlayerCount(value: string) {
    const count = clamp(Number(value) || 1, 1, 12);
    setPlayers((currentPlayers) =>
      Array.from({ length: count }, (_, index) => currentPlayers[index] || createDefaultPlayers(count)[index])
    );
    setActiveIndex((currentIndex) => clamp(currentIndex, 0, count - 1));
    setRoundStartIndex((currentIndex) => clamp(currentIndex, 0, count - 1));
    stopTimer();
  }

  function updatePlayerName(index: number, value: string) {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player, playerIndex) =>
        playerIndex === index ? { ...player, name: value.trim() || `Player ${index + 1}` } : player
      )
    );
  }

  function updatePlayerColor(index: number, value: string) {
    setPlayers((currentPlayers) =>
      currentPlayers.map((player, playerIndex) => (playerIndex === index ? { ...player, color: value } : player))
    );
  }

  function togglePassing(enabled: boolean) {
    setPassingEnabled(enabled);
    if (!enabled) {
      setPlayers((currentPlayers) => currentPlayers.map((player) => ({ ...player, passed: false })));
    }
  }

  return (
    <main class="app-shell">
      <section class="timer-panel" aria-live="polite" hidden={settingsOpen()}>
        <div class="timer-top">
          <div class="active-player">
            <span class="player-swatch" style={{ "background-color": activePlayer()?.color }}></span>
            <div>
              <p class="eyebrow">Current Turn</p>
              <h1>{activePlayer()?.name}</h1>
            </div>
          </div>

          <div class="menu-wrap" onClick={(event) => event.stopPropagation()}>
            <button
              class="menu-button"
              type="button"
              aria-label="Timer menu"
              aria-expanded={menuOpen()}
              aria-controls="timerMenu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            <div class="timer-menu" id="timerMenu" hidden={!menuOpen()}>
              <button type="button" onClick={showSettingsView}>
                Settings
              </button>
              <button type="button" onClick={resetTurn}>
                Reset Turn
              </button>
              <button type="button" onClick={resetAll}>
                Reset All
              </button>
              <button
                type="button"
                onClick={() => {
                  setSoundEnabled((enabled) => !enabled);
                  setMenuOpen(false);
                }}
              >
                {soundEnabled() ? "Sound On" : "Sound Off"}
              </button>
            </div>
          </div>
        </div>

        <div classList={{ "time-display": true, expired: remainingSeconds() <= 0 }}>{formatTime(remainingSeconds())}</div>

        <div class="next-start-row">
          <button class="next-start-button" type="button" disabled={!hasEligiblePlayer()} onClick={nextPlayerAndStart}>
            Next Player and Start
          </button>
        </div>

        <Show when={passingEnabled()}>
          <div class="pass-row">
            <button
              class="secondary-button pass-button"
              type="button"
              disabled={activePlayer()?.passed}
              onClick={passForRound}
            >
              Pass Round
            </button>
          </div>
        </Show>

        <div class="turn-controls">
          <button
            class="icon-button"
            type="button"
            title="Previous player"
            aria-label="Previous player"
            disabled={!hasEligiblePlayer()}
            onClick={() => moveTurn(-1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button class="secondary-button round-button" type="button" onClick={nextRound}>
            Next Round
          </button>
          <button
            class="primary-button"
            type="button"
            disabled={timerDisabled()}
            onClick={() => (running() ? stopTimer() : startTimer())}
          >
            {running() ? "Pause" : "Start"}
          </button>
          <button
            class="icon-button"
            type="button"
            title="Next player"
            aria-label="Next player"
            disabled={!hasEligiblePlayer()}
            onClick={() => moveTurn(1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <section class="setup-panel" hidden={!settingsOpen()}>
        <div class="setup-header">
          <div>
            <p class="eyebrow">Game Setup</p>
            <h2>Players and Clock</h2>
          </div>
          <button class="back-button" type="button" onClick={showTimerView}>
            Back to Timer
          </button>
        </div>

        <label class="player-count">
          <span>Players</span>
          <input
            type="number"
            min="1"
            max="12"
            value={players().length}
            onChange={(event) => updatePlayerCount(event.currentTarget.value)}
          />
        </label>

        <div class="time-settings">
          <label>
            <span>Minutes per turn</span>
            <input
              type="number"
              min="0"
              max="99"
              value={minutesInput()}
              onInput={(event) => setMinutesInput(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Seconds</span>
            <input
              type="number"
              min="0"
              max="59"
              value={secondsInput()}
              onInput={(event) => setSecondsInput(event.currentTarget.value)}
            />
          </label>
          <button type="button" onClick={applyTurnTime}>
            Apply Time
          </button>
        </div>

        <div class="game-settings" aria-label="Game settings">
          <label class="toggle-setting">
            <span>Passing</span>
            <input
              type="checkbox"
              checked={passingEnabled()}
              onChange={(event) => togglePassing(event.currentTarget.checked)}
            />
          </label>
          <label class="toggle-setting">
            <span>Rotate starting player</span>
            <input
              type="checkbox"
              checked={rotateStartPlayer()}
              onChange={(event) => setRotateStartPlayer(event.currentTarget.checked)}
            />
          </label>
        </div>

        <div class="players-list" aria-label="Player settings">
          <For each={players()}>
            {(player, index) => (
              <div
                classList={{
                  "player-row": true,
                  active: index() === activeIndex(),
                  passed: player.passed
                }}
              >
                <label>
                  <span>Player {index() + 1} name</span>
                  <input
                    type="text"
                    value={player.name}
                    maxLength="28"
                    onInput={(event) => updatePlayerName(index(), event.currentTarget.value)}
                  />
                </label>

                <label>
                  <span>Color</span>
                  <input
                    type="color"
                    class="color-input"
                    value={player.color}
                    onInput={(event) => updatePlayerColor(index(), event.currentTarget.value)}
                  />
                </label>

                <Show when={player.passed}>
                  <span class="passed-label">Passed</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </main>
  );
}
