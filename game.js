/* ============================================================
   ЗМЕЙКА — современная веб-игра
   Клавиатура + свайпы + D-pad, пауза, перезапуск,
   выбор сложности, текущий и рекордный счёт (localStorage).
   ============================================================ */
(() => {
  "use strict";

  // ---------- Константы ----------
  const GRID = 21;                 // клеток по стороне
  const BEST_KEY = "snake.best.v1";
  const SPEED_KEY = "snake.speed.v1";
  const DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const scoreVal = document.getElementById("scoreVal");
  const bestVal = document.getElementById("bestVal");
  const scoreChip = document.getElementById("scoreChip");
  const startOverlay = document.getElementById("startOverlay");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const newRecordMsg = document.getElementById("newRecordMsg");
  const finalScoreMsg = document.getElementById("finalScoreMsg");
  const pauseBtn = document.getElementById("pauseBtn");

  // ---------- Состояние игры ----------
  const State = { MENU: "menu", RUNNING: "running", PAUSED: "paused", OVER: "over" };

  const game = {
    state: State.MENU,
    snake: [],            // [{x,y}, ...] голова — первый элемент
    dir: DIRS.right,
    nextDir: DIRS.right,
    food: { x: 5, y: 5 },
    score: 0,
    best: loadBest(),
    speed: loadSpeed(),   // мс на шаг
    lastStep: 0,
    // анимации
    foodPulse: 0,
    deathAt: 0,
    particles: [],
    eatFlash: 0,
    cell: 0,              // размер клетки в px (CSS)
    dpr: 1,
  };

  // ---------- Хранилище ----------
  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY), 10) || 0; }
    catch { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch {}
  }
  function loadSpeed() {
    try {
      const s = parseInt(localStorage.getItem(SPEED_KEY), 10);
      return s > 0 ? s : 110;
    } catch { return 110; }
  }
  function saveSpeed(v) {
    try { localStorage.setItem(SPEED_KEY, String(v)); } catch {}
  }

  // ---------- Звук (WebAudio, без файлов) ----------
  let audioCtx = null;
  let soundOn = true;

  function beep(freq, dur = 0.08, type = "square", vol = 0.04) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  // ---------- Canvas / ресайз ----------
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    game.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(rect.width * game.dpr);
    canvas.height = Math.round(rect.height * game.dpr);
    game.cell = canvas.width / GRID;
  }

  window.addEventListener("resize", resizeCanvas);
  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeCanvas).observe(canvas);
  }

  // ---------- Игровая логика ----------
  function resetGame() {
    const mid = Math.floor(GRID / 2);
    game.snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    game.dir = DIRS.right;
    game.nextDir = DIRS.right;
    game.score = 0;
    game.particles = [];
    game.eatFlash = 0;
    updateScoreUI();
    spawnFood();
  }

  function spawnFood() {
    const free = [];
    const occupied = new Set(game.snake.map(s => s.x + "," + s.y));
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++)
        if (!occupied.has(x + "," + y)) free.push({ x, y });
    if (free.length === 0) { winGame(); return; }
    game.food = free[Math.floor(Math.random() * free.length)];
  }

  function setDirection(name) {
    const nd = DIRS[name];
    if (!nd) return;
    // запрет разворота на 180°
    if (nd.x === -game.dir.x && nd.y === -game.dir.y) return;
    game.nextDir = nd;
  }

  function step(now) {
    game.dir = game.nextDir;
    const head = game.snake[0];
    const nx = head.x + game.dir.x;
    const ny = head.y + game.dir.y;

    // столкновение со стеной
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return gameOver(now);

    // столкновение с телом (хвост сдвинется, поэтому исключаем последнюю клетку,
    // если не съедена еда)
    const willEat = nx === game.food.x && ny === game.food.y;
    const bodyLen = willEat ? game.snake.length : game.snake.length - 1;
    for (let i = 0; i < bodyLen; i++) {
      if (game.snake[i].x === nx && game.snake[i].y === ny) return gameOver(now);
    }

    game.snake.unshift({ x: nx, y: ny });

    if (willEat) {
      game.score += 10;
      game.eatFlash = 1;
      burstParticles(nx, ny);
      beep(660 + Math.min(game.score, 300), 0.07, "square", 0.05);
      updateScoreUI(true);
      spawnFood();
    } else {
      game.snake.pop();
    }
  }

  function burstParticles(cx, cy) {
    const px = (cx + 0.5) * game.cell;
    const py = (cy + 0.5) * game.cell;
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
      const sp = (1.5 + Math.random() * 2.5) * game.dpr;
      game.particles.push({
        x: px, y: py,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1,
        color: Math.random() > 0.5 ? "#fb7185" : "#fbbf24",
        r: (2 + Math.random() * 2.5) * game.dpr,
      });
    }
  }

  function gameOver(now) {
    game.state = State.OVER;
    game.deathAt = now;
    beep(180, 0.25, "sawtooth", 0.06);
    setTimeout(() => beep(120, 0.3, "sawtooth", 0.05), 140);

    const isRecord = game.score > game.best;
    if (isRecord) {
      game.best = game.score;
      saveBest(game.best);
      updateScoreUI();
    }
    newRecordMsg.classList.toggle("show", isRecord && game.score > 0);
    finalScoreMsg.textContent = `Ваш счёт: ${game.score} · Рекорд: ${game.best}`;
    showOverlay(gameOverOverlay);
  }

  function winGame() {
    game.state = State.OVER;
    finalScoreMsg.textContent = `Невероятно! Поле заполнено. Счёт: ${game.score}`;
    if (game.score > game.best) { game.best = game.score; saveBest(game.best); updateScoreUI(); }
    showOverlay(gameOverOverlay);
  }

  function updateScoreUI(bump = false) {
    scoreVal.textContent = game.score;
    bestVal.textContent = game.best;
    if (bump) {
      scoreChip.classList.remove("bump");
      void scoreChip.offsetWidth; // перезапуск анимации
      scoreChip.classList.add("bump");
    }
  }

  // ---------- Оверлеи ----------
  function hideOverlays() {
    [startOverlay, pauseOverlay, gameOverOverlay].forEach(o => o.classList.remove("visible"));
  }
  function showOverlay(o) {
    hideOverlays();
    o.classList.add("visible");
  }

  // ---------- Управление состоянием ----------
  function startGame() {
    resetGame();
    game.state = State.RUNNING;
    game.lastStep = performance.now();
    hideOverlays();
    beep(520, 0.06, "triangle", 0.05);
  }

  function togglePause(forceState) {
    if (game.state === State.RUNNING && forceState !== "resume") {
      game.state = State.PAUSED;
      showOverlay(pauseOverlay);
      pauseBtn.textContent = "▶";
    } else if (game.state === State.PAUSED) {
      game.state = State.RUNNING;
      game.lastStep = performance.now();
      hideOverlays();
      pauseBtn.textContent = "⏸";
    }
  }

  function restart() {
    if (game.state === State.MENU) { startGame(); return; }
    startGame();
  }

  function toMenu() {
    game.state = State.MENU;
    resetGame();
    showOverlay(startOverlay);
    pauseBtn.textContent = "⏸";
  }

  // ---------- Клавиатура ----------
  const KEY_MAP = {
    ArrowUp: "up", KeyW: "up", Ц: "up",
    ArrowDown: "down", KeyS: "down", Ы: "down",
    ArrowLeft: "left", KeyA: "left", Ф: "left",
    ArrowRight: "right", KeyD: "right", В: "right",
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat && e.code === "Space") return;

    const dirName = KEY_MAP[e.code];
    if (dirName) {
      e.preventDefault();
      if (game.state === State.MENU || game.state === State.OVER) return;
      if (game.state === State.PAUSED) togglePause("resume");
      setDirection(dirName);
      return;
    }

    switch (e.code) {
      case "Space":
        e.preventDefault();
        if (game.state === State.MENU || game.state === State.OVER) startGame();
        else togglePause();
        break;
      case "KeyP":
        if (game.state === State.RUNNING || game.state === State.PAUSED) togglePause();
        break;
      case "KeyR":
        e.preventDefault();
        restart();
        break;
      case "Escape":
        if (game.state === State.RUNNING) togglePause();
        break;
      case "Digit1": case "Digit2": case "Digit3": case "Digit4":
        selectDifficulty(parseInt(e.code.slice(-1), 10) - 1);
        break;
    }
  }, { passive: false });

  // ---------- Свайпы по канвасу ----------
  let touchStart = null;

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault(); // блокируем прокрутку страницы во время свайпа
    if (!touchStart) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const THRESH = 24;
    if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;

    if (game.state === State.RUNNING) {
      if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? "right" : "left");
      else setDirection(dy > 0 ? "down" : "up");
    }
    touchStart = { x: t.clientX, y: t.clientY, time: Date.now() }; // свайп «на лету»
  }, { passive: false });

  canvas.addEventListener("touchend", () => { touchStart = null; });

  // Тап по канвасу во время игры = пауза (удобно на мобильных)
  canvas.addEventListener("click", () => {
    if (game.state === State.RUNNING || game.state === State.PAUSED) togglePause();
  });

  // ---------- D-pad ----------
  document.querySelectorAll(".dpad button[data-dir]").forEach(btn => {
    const handler = (e) => {
      e.preventDefault();
      if (game.state === State.PAUSED) togglePause("resume");
      if (game.state === State.RUNNING) setDirection(btn.dataset.dir);
    };
    btn.addEventListener("touchstart", handler, { passive: false });
    btn.addEventListener("mousedown", handler);
  });

  // ---------- Кнопки UI ----------
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("restartBtn").addEventListener("click", startGame);
  document.getElementById("pauseRestartBtn").addEventListener("click", startGame);
  document.getElementById("menuBtn").addEventListener("click", toMenu);
  document.getElementById("resumeBtn").addEventListener("click", () => togglePause("resume"));
  pauseBtn.addEventListener("click", () => {
    if (game.state === State.RUNNING || game.state === State.PAUSED) togglePause();
  });
  document.getElementById("restartIconBtn").addEventListener("click", restart);

  const soundBtn = document.getElementById("soundBtn");
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    if (soundOn) beep(700, 0.05, "triangle", 0.04);
  });

  // ---------- Выбор сложности ----------
  const diffButtons = [...document.querySelectorAll(".diff-btn")];

  function selectDifficulty(index) {
    const btn = diffButtons[index];
    if (!btn) return;
    diffButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    game.speed = parseInt(btn.dataset.speed, 10);
    saveSpeed(game.speed);
  }

  diffButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => selectDifficulty(i));
  });

  // восстановить выбранную сложность
  (() => {
    const match = diffButtons.find(b => parseInt(b.dataset.speed, 10) === game.speed);
    if (match) {
      diffButtons.forEach(b => b.classList.remove("active"));
      match.classList.add("active");
    }
  })();

  // Пауза при уходе со страницы
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === State.RUNNING) togglePause();
  });

  // ---------- Отрисовка ----------
  function drawBoard(now) {
    const w = canvas.width, h = canvas.height;
    const c = game.cell;

    // фон
    ctx.fillStyle = "#16213a";
    ctx.fillRect(0, 0, w, h);

    // шахматная сетка
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if ((x + y) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.022)";
          ctx.fillRect(x * c, y * c, c, c);
        }
      }
    }

    // вспышка при поедании
    if (game.eatFlash > 0) {
      ctx.fillStyle = `rgba(34,211,238,${game.eatFlash * 0.07})`;
      ctx.fillRect(0, 0, w, h);
      game.eatFlash = Math.max(0, game.eatFlash - 0.06);
    }

    // еда (пульсирующая)
    game.foodPulse += 0.09;
    const pulse = 0.78 + Math.sin(game.foodPulse) * 0.12;
    const fx = (game.food.x + 0.5) * c;
    const fy = (game.food.y + 0.5) * c;
    const fr = c * 0.32 * pulse;

    ctx.save();
    ctx.shadowColor = "rgba(251,113,133,0.8)";
    ctx.shadowBlur = c * 0.5;
    const grad = ctx.createRadialGradient(fx - fr * 0.3, fy - fr * 0.3, fr * 0.2, fx, fy, fr);
    grad.addColorStop(0, "#fecdd3");
    grad.addColorStop(1, "#f43f5e");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // хвостик еды
    ctx.strokeStyle = "#4ade80";
    ctx.lineWidth = Math.max(1.5, c * 0.06);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fx, fy - fr);
    ctx.quadraticCurveTo(fx + fr * 0.6, fy - fr * 1.6, fx + fr * 0.3, fy - fr * 2);
    ctx.stroke();

    // змейка
    const dead = game.state === State.OVER;
    const n = game.snake.length;
    for (let i = n - 1; i >= 0; i--) {
      const s = game.snake[i];
      const t = i / Math.max(n - 1, 1);
      const pad = c * 0.06;
      const x = s.x * c + pad, y = s.y * c + pad;
      const size = c - pad * 2;
      const radius = c * (i === 0 ? 0.42 : 0.3);

      if (dead) {
        ctx.fillStyle = `hsl(${4 + i * 0.6}, 75%, ${52 - t * 14}%)`;
      } else {
        const hue = 160 + t * 25;             // изумрудный градиент к хвосту
        const light = 55 - t * 16;
        ctx.fillStyle = `hsl(${hue}, 70%, ${light}%)`;
      }

      if (i === 0 && !dead) {
        ctx.save();
        ctx.shadowColor = "rgba(52,211,153,0.6)";
        ctx.shadowBlur = c * 0.4;
      }

      roundRect(ctx, x, y, size, size, radius);
      ctx.fill();

      if (i === 0 && !dead) ctx.restore();

      // глаза
      if (i === 0) {
        drawEyes(s, dead);
      }
    }

    // частицы
    if (game.particles.length) {
      game.particles = game.particles.filter(p => p.life > 0);
      for (const p of game.particles) {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.12 * game.dpr;
        p.life -= 0.03;
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawEyes(head, dead) {
    const c = game.cell;
    const cx = (head.x + 0.5) * c;
    const cy = (head.y + 0.5) * c;
    const d = game.dir;
    const off = c * 0.16;
    const perp = { x: -d.y, y: d.x };
    const eyeR = c * (dead ? 0.07 : 0.09);

    for (const side of [-1, 1]) {
      const ex = cx + d.x * off + perp.x * off * side;
      const ey = cy + d.y * off + perp.y * off * side;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fill();
      if (dead) {
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = Math.max(1, c * 0.04);
        ctx.beginPath();
        ctx.moveTo(ex - eyeR * 0.6, ey - eyeR * 0.6);
        ctx.lineTo(ex + eyeR * 0.6, ey + eyeR * 0.6);
        ctx.moveTo(ex + eyeR * 0.6, ey - eyeR * 0.6);
        ctx.lineTo(ex - eyeR * 0.6, ey + eyeR * 0.6);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(ex + d.x * eyeR * 0.35, ey + d.y * eyeR * 0.35, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Главный цикл ----------
  function loop(now) {
    if (game.state === State.RUNNING) {
      // несколько шагов за кадр на высокой скорости
      while (now - game.lastStep >= game.speed && game.state === State.RUNNING) {
        game.lastStep += game.speed;
        step(now);
      }
    }
    drawBoard(now);
    requestAnimationFrame(loop);
  }

  // ---------- Инициализация ----------
  resizeCanvas();
  resetGame();
  updateScoreUI();
  requestAnimationFrame(loop);
})();
