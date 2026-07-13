"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const WATER_LINE = 355;
const ROUND_SECONDS = 45;
const STORAGE_KEY = "kurka_wodna_best_v1";

const ui = {
  score: document.getElementById("score"),
  time: document.getElementById("time"),
  combo: document.getElementById("combo"),
  accuracy: document.getElementById("accuracy"),
  bestScore: document.getElementById("best-score"),
  startScreen: document.getElementById("start-screen"),
  resultScreen: document.getElementById("result-screen"),
  startButton: document.getElementById("start-button"),
  againButton: document.getElementById("again-button"),
  resultTitle: document.getElementById("result-title"),
  resultScore: document.getElementById("result-score"),
  resultAccuracy: document.getElementById("result-accuracy"),
  resultCombo: document.getElementById("result-combo"),
  resultNote: document.getElementById("result-note"),
  shotMessage: document.getElementById("shot-message"),
};

let gameState = "menu";
let score = 0;
let remaining = ROUND_SECONDS;
let combo = 0;
let bestCombo = 0;
let shots = 0;
let hits = 0;
let spawnTimer = 0;
let lastTime = performance.now();
let audioContext = null;
let lastShot = null;
let bestScore = loadBestScore();

const birds = [];
const particles = [];
const ripples = [];
const clouds = Array.from({ length: 7 }, (_, index) => ({
  x: index * 170 + random(-40, 50),
  y: random(75, 225),
  size: random(34, 72),
  speed: random(3, 8),
}));
const reeds = Array.from({ length: 54 }, (_, index) => ({
  x: (index / 53) * WIDTH + random(-12, 12),
  height: random(45, 130),
  sway: random(0, Math.PI * 2),
}));

ui.bestScore.textContent = bestScore.toLocaleString("pl-PL");

function loadBestScore() {
  try {
    const value = Number.parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(STORAGE_KEY, String(bestScore));
  } catch {
    // Gra działa również wtedy, gdy pamięć lokalna jest zablokowana.
  }
}

function startGame() {
  initAudio();
  gameState = "playing";
  score = 0;
  remaining = ROUND_SECONDS;
  combo = 0;
  bestCombo = 0;
  shots = 0;
  hits = 0;
  spawnTimer = 180;
  birds.length = 0;
  particles.length = 0;
  ripples.length = 0;
  lastShot = null;
  ui.startScreen.classList.remove("visible");
  ui.resultScreen.classList.remove("visible");
  updateHud();
  createBird("regular");
  createBird("regular");
  createBird(Math.random() < 0.5 ? "golden" : "regular");
  playSound("start");
}

function finishGame() {
  if (gameState !== "playing") return;
  gameState = "result";
  const accuracy = getAccuracy();
  const isRecord = score > bestScore;

  if (isRecord) {
    bestScore = score;
    saveBestScore();
    ui.bestScore.textContent = bestScore.toLocaleString("pl-PL");
  }

  ui.resultScore.textContent = score.toLocaleString("pl-PL");
  ui.resultAccuracy.textContent = `${accuracy}%`;
  ui.resultCombo.textContent = String(bestCombo);
  ui.resultTitle.textContent = isRecord ? "Nowy rekord!" : score >= 2200 ? "Sokole oko!" : score >= 1100 ? "Dobry wynik!" : "Jeszcze jedna runda?";
  ui.resultNote.textContent = isRecord
    ? "Świetna seria — ten wynik zapisaliśmy jako nowy rekord."
    : `Rekord do pobicia: ${bestScore.toLocaleString("pl-PL")} punktów.`;
  ui.resultScreen.classList.add("visible");
  playSound(isRecord ? "record" : "finish");
}

function updateHud() {
  ui.score.textContent = score.toLocaleString("pl-PL");
  ui.time.textContent = String(Math.max(0, Math.ceil(remaining)));
  ui.combo.textContent = `×${formatMultiplier(getMultiplier(combo))}`;
  ui.accuracy.textContent = shots ? `${getAccuracy()}%` : "—";
}

function getAccuracy() {
  return shots ? Math.round((hits / shots) * 100) : 0;
}

function getMultiplier(value) {
  return Math.min(3, 1 + Math.floor(value / 5) * 0.5);
}

function formatMultiplier(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function createBird(forcedKind = null, ambient = false) {
  const roll = Math.random();
  const kind = forcedKind || (roll < 0.11 ? "golden" : roll < 0.24 ? "swan" : "regular");
  const swimming = Math.random() < 0.26;
  const direction = Math.random() < 0.5 ? 1 : -1;
  const margin = kind === "swan" ? 105 : 80;
  const baseY = swimming ? random(425, 500) : random(135, 330);
  const speedBase = kind === "golden" ? random(150, 205) : kind === "swan" ? random(105, 150) : random(115, 180);
  const speed = swimming ? speedBase * 0.58 : speedBase;

  birds.push({
    kind,
    mode: swimming ? "swim" : "fly",
    direction,
    x: direction > 0 ? -margin : WIDTH + margin,
    y: baseY,
    baseY,
    speed: ambient ? speed * 0.55 : speed,
    age: random(0, 1200),
    phase: random(0, Math.PI * 2),
    scale: swimming ? random(0.92, 1.12) : random(0.9, 1.18),
    hitRadius: kind === "swan" ? 72 : 66,
  });
}

function handleShot(event) {
  event.preventDefault();
  if (gameState !== "playing") return;
  initAudio();

  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * WIDTH / rect.width;
  const y = (event.clientY - rect.top) * HEIGHT / rect.height;
  lastShot = { x, y, life: 280 };
  shots += 1;

  let hitIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  birds.forEach((bird, index) => {
    const distance = Math.hypot(x - bird.x, y - bird.y);
    if (distance <= bird.hitRadius * bird.scale && distance < nearestDistance) {
      nearestDistance = distance;
      hitIndex = index;
    }
  });

  if (hitIndex < 0) {
    combo = 0;
    showShotMessage("PUDŁO", x, y, true);
    spawnImpact(x, y, "rgba(255,255,255,0.72)", 5);
    playSound("miss");
    navigator.vibrate?.(5);
    updateHud();
    return;
  }

  const [bird] = birds.splice(hitIndex, 1);
  if (bird.kind === "swan") {
    score = Math.max(0, score - 200);
    combo = 0;
    showShotMessage("ŁABĘDŹ −200", bird.x, bird.y, true);
    spawnFeathers(bird.x, bird.y, "#f7f7e9", 18);
    playSound("bad");
    navigator.vibrate?.([18, 35, 18]);
  } else {
    combo += 1;
    bestCombo = Math.max(bestCombo, combo);
    hits += 1;
    const basePoints = bird.kind === "golden" ? 350 : 100;
    const points = Math.round(basePoints * getMultiplier(combo));
    score += points;
    showShotMessage(bird.kind === "golden" ? `ZŁOTA +${points}` : `+${points}`, bird.x, bird.y, false);
    spawnFeathers(bird.x, bird.y, bird.kind === "golden" ? "#ffd45d" : "#d96b45", bird.kind === "golden" ? 22 : 14);
    playSound(bird.kind === "golden" ? "gold" : "hit");
    navigator.vibrate?.(12);
  }

  if (bird.mode === "swim") {
    ripples.push({ x: bird.x, y: bird.y + 23, radius: 12, life: 500, maxLife: 500 });
  }
  updateHud();
}

function showShotMessage(text, x, y, bad) {
  ui.shotMessage.textContent = text;
  ui.shotMessage.style.left = `${clamp(x / WIDTH * 100, 8, 92)}%`;
  ui.shotMessage.style.top = `${clamp(y / HEIGHT * 100, 13, 88)}%`;
  ui.shotMessage.classList.remove("show", "bad");
  if (bad) ui.shotMessage.classList.add("bad");
  void ui.shotMessage.offsetWidth;
  ui.shotMessage.classList.add("show");
}

function updateGame(dt) {
  remaining -= dt / 1000;
  if (remaining <= 0) {
    remaining = 0;
    updateHud();
    finishGame();
    return;
  }

  spawnTimer -= dt;
  const progress = 1 - remaining / ROUND_SECONDS;
  const spawnDelay = 850 - progress * 330;
  if (spawnTimer <= 0 && birds.length < 8) {
    createBird();
    if (progress > 0.55 && Math.random() < 0.22 && birds.length < 8) createBird();
    spawnTimer = spawnDelay * random(0.76, 1.22);
  }

  updateBirds(dt, false);
  updateHud();
}

function updateAmbient(dt) {
  updateBirds(dt, true);
  while (birds.length < 4) createBird(Math.random() < 0.18 ? "golden" : "regular", true);
}

function updateBirds(dt, ambient) {
  for (let index = birds.length - 1; index >= 0; index -= 1) {
    const bird = birds[index];
    bird.age += dt;
    bird.x += bird.direction * bird.speed * dt / 1000;
    const bob = bird.mode === "swim" ? 3 : 13;
    const frequency = bird.mode === "swim" ? 0.0023 : 0.0042;
    bird.y = bird.baseY + Math.sin(bird.age * frequency + bird.phase) * bob;

    const escaped = bird.direction > 0 ? bird.x > WIDTH + 125 : bird.x < -125;
    if (escaped) birds.splice(index, 1);
  }

  if (ambient && birds.length === 0) createBird("regular", true);
}

function updateEffects(dt) {
  if (lastShot) {
    lastShot.life -= dt;
    if (lastShot.life <= 0) lastShot = null;
  }

  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.life -= dt;
    particle.x += particle.vx * dt / 1000;
    particle.y += particle.vy * dt / 1000;
    particle.vy += 155 * dt / 1000;
    particle.rotation += particle.spin * dt / 1000;
    if (particle.life <= 0) particles.splice(index, 1);
  }

  for (let index = ripples.length - 1; index >= 0; index -= 1) {
    const ripple = ripples[index];
    ripple.life -= dt;
    ripple.radius += 44 * dt / 1000;
    if (ripple.life <= 0) ripples.splice(index, 1);
  }

  clouds.forEach((cloud) => {
    cloud.x += cloud.speed * dt / 1000;
    if (cloud.x - cloud.size * 2 > WIDTH) cloud.x = -cloud.size * 2;
  });
}

function spawnFeathers(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = random(65, 230);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 35,
      life: random(420, 800),
      maxLife: 800,
      size: random(3, 8),
      color,
      rotation: random(0, Math.PI * 2),
      spin: random(-7, 7),
      feather: true,
    });
  }
}

function spawnImpact(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = random(25, 95);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: random(180, 340),
      maxLife: 340,
      size: random(2, 4),
      color,
      rotation: 0,
      spin: 0,
      feather: false,
    });
  }
}

function draw() {
  drawBackground();
  birds.forEach(drawBird);
  drawRipples();
  drawParticles();
  drawForegroundReeds();
  drawCrosshair();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_LINE);
  sky.addColorStop(0, "#75c8cc");
  sky.addColorStop(0.62, "#a9dcce");
  sky.addColorStop(1, "#f2d48b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, WATER_LINE);

  const sunGlow = ctx.createRadialGradient(760, 120, 10, 760, 120, 110);
  sunGlow.addColorStop(0, "rgba(255,244,176,0.95)");
  sunGlow.addColorStop(0.28, "rgba(255,211,99,0.55)");
  sunGlow.addColorStop(1, "rgba(255,202,88,0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(640, 0, 240, 245);
  ctx.fillStyle = "#ffe794";
  ctx.beginPath();
  ctx.arc(760, 120, 43, 0, Math.PI * 2);
  ctx.fill();

  clouds.forEach((cloud) => drawCloud(cloud.x, cloud.y, cloud.size));

  ctx.fillStyle = "rgba(38,91,76,0.56)";
  ctx.beginPath();
  ctx.moveTo(0, WATER_LINE);
  for (let x = 0; x <= WIDTH; x += 35) {
    ctx.lineTo(x, WATER_LINE - 25 - Math.sin(x * 0.027) * 19 - Math.sin(x * 0.071) * 8);
  }
  ctx.lineTo(WIDTH, WATER_LINE);
  ctx.closePath();
  ctx.fill();

  const water = ctx.createLinearGradient(0, WATER_LINE, 0, HEIGHT);
  water.addColorStop(0, "#2c8a88");
  water.addColorStop(0.54, "#17696f");
  water.addColorStop(1, "#0a3c46");
  ctx.fillStyle = water;
  ctx.fillRect(0, WATER_LINE, WIDTH, HEIGHT - WATER_LINE);

  ctx.strokeStyle = "rgba(214,242,215,0.17)";
  ctx.lineWidth = 2;
  for (let y = WATER_LINE + 22; y < HEIGHT; y += 27) {
    const offset = Math.sin(y * 0.08) * 28;
    for (let x = -80; x < WIDTH; x += 165) {
      ctx.beginPath();
      ctx.moveTo(x + offset, y);
      ctx.quadraticCurveTo(x + 45 + offset, y - 5, x + 105 + offset, y);
      ctx.stroke();
    }
  }

  ctx.fillStyle = "rgba(13,67,56,0.72)";
  for (let x = 0; x < WIDTH; x += 24) {
    const height = 20 + (Math.sin(x * 0.37) + 1) * 14;
    ctx.fillRect(x, WATER_LINE - height, 5, height + 4);
  }
}

function drawCloud(x, y, size) {
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = "#f5f4d9";
  ctx.beginPath();
  ctx.arc(x, y, size * 0.34, 0, Math.PI * 2);
  ctx.arc(x + size * 0.34, y - size * 0.1, size * 0.46, 0, Math.PI * 2);
  ctx.arc(x + size * 0.73, y, size * 0.31, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBird(bird) {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.scale(bird.direction * bird.scale, bird.scale);

  if (bird.mode === "swim") {
    ctx.fillStyle = "rgba(3,36,43,0.3)";
    ctx.beginPath();
    ctx.ellipse(0, 28, 57, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (bird.kind === "swan") {
    drawSwan(bird);
  } else {
    drawWaterHen(bird);
  }
  ctx.restore();
}

function drawWaterHen(bird) {
  const golden = bird.kind === "golden";
  const flap = bird.mode === "fly" ? Math.sin(bird.age * 0.018) : 0.15;

  if (golden) {
    const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 72);
    glow.addColorStop(0, "rgba(255,221,91,0.42)");
    glow.addColorStop(1, "rgba(255,204,61,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-80, -80, 160, 160);
  }

  if (bird.mode === "fly") {
    ctx.strokeStyle = golden ? "#9b6719" : "#593c2f";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-14, 20);
    ctx.lineTo(-22, 36);
    ctx.moveTo(4, 21);
    ctx.lineTo(0, 38);
    ctx.stroke();
  }

  ctx.fillStyle = golden ? "#f3b832" : "#ad563e";
  ctx.beginPath();
  ctx.ellipse(-6, 0, 48, 30, -0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = golden ? "#ffd85b" : "#e17a4e";
  ctx.beginPath();
  ctx.ellipse(-10, -2, 31, 15 + Math.abs(flap) * 15, -0.25 + flap * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = golden ? "#ffca3e" : "#314e45";
  ctx.beginPath();
  ctx.arc(30, -22, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = golden ? "#f5a72d" : "#f08a4f";
  ctx.beginPath();
  ctx.moveTo(47, -25);
  ctx.lineTo(69, -19);
  ctx.lineTo(47, -13);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#0c1b18";
  ctx.beginPath();
  ctx.arc(36, -28, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(37, -29, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = golden ? "#ffe47d" : "#f3b08a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-49, -5);
  ctx.lineTo(-65, -16);
  ctx.moveTo(-48, 4);
  ctx.lineTo(-65, 12);
  ctx.stroke();
}

function drawSwan(bird) {
  const flap = bird.mode === "fly" ? Math.sin(bird.age * 0.015) : 0;
  ctx.fillStyle = "#f6f5df";
  ctx.beginPath();
  ctx.ellipse(-7, 5, 53, 27, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#dadfd5";
  ctx.beginPath();
  ctx.ellipse(-17, 0, 34, 13 + Math.abs(flap) * 16, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#f6f5df";
  ctx.lineWidth = 17;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(26, -2);
  ctx.quadraticCurveTo(20, -52, 51, -55);
  ctx.stroke();

  ctx.fillStyle = "#f6f5df";
  ctx.beginPath();
  ctx.arc(54, -56, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f29b38";
  ctx.beginPath();
  ctx.moveTo(66, -60);
  ctx.lineTo(86, -54);
  ctx.lineTo(66, -49);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#17211f";
  ctx.beginPath();
  ctx.arc(59, -61, 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-50, 2);
  ctx.lineTo(-68, -8);
  ctx.moveTo(-50, 10);
  ctx.lineTo(-68, 17);
  ctx.stroke();
}

function drawRipples() {
  ripples.forEach((ripple) => {
    ctx.globalAlpha = Math.max(0, ripple.life / ripple.maxLife) * 0.65;
    ctx.strokeStyle = "#d9f0df";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, ripple.radius * 1.7, ripple.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    if (particle.feather) {
      ctx.ellipse(0, 0, particle.size * 1.8, particle.size * 0.62, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  });
}

function drawForegroundReeds() {
  ctx.save();
  ctx.strokeStyle = "#153f35";
  ctx.fillStyle = "#173d31";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  reeds.forEach((reed, index) => {
    const sway = Math.sin(performance.now() * 0.001 + reed.sway) * 5;
    const baseY = HEIGHT + 8;
    ctx.beginPath();
    ctx.moveTo(reed.x, baseY);
    ctx.quadraticCurveTo(reed.x + sway * 0.5, baseY - reed.height * 0.55, reed.x + sway, baseY - reed.height);
    ctx.stroke();
    if (index % 4 === 0) {
      ctx.beginPath();
      ctx.ellipse(reed.x + sway, baseY - reed.height - 8, 7, 17, -0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

function drawCrosshair() {
  if (!lastShot) return;
  const alpha = clamp(lastShot.life / 280, 0, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#fff4bd";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(lastShot.x, lastShot.y, 17, 0, Math.PI * 2);
  ctx.moveTo(lastShot.x - 28, lastShot.y);
  ctx.lineTo(lastShot.x - 9, lastShot.y);
  ctx.moveTo(lastShot.x + 9, lastShot.y);
  ctx.lineTo(lastShot.x + 28, lastShot.y);
  ctx.moveTo(lastShot.x, lastShot.y - 28);
  ctx.lineTo(lastShot.x, lastShot.y - 9);
  ctx.moveTo(lastShot.x, lastShot.y + 9);
  ctx.lineTo(lastShot.x, lastShot.y + 28);
  ctx.stroke();
  ctx.restore();
}

function initAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioContext = new AudioCtx();
  }
  if (audioContext?.state === "suspended") audioContext.resume();
}

function playSound(type) {
  if (!audioContext) return;
  const sounds = {
    start: [240, 520, 0.22, "triangle", 0.055],
    hit: [420, 710, 0.09, "sine", 0.065],
    gold: [520, 980, 0.18, "triangle", 0.07],
    miss: [105, 70, 0.06, "square", 0.025],
    bad: [170, 62, 0.2, "sawtooth", 0.045],
    finish: [300, 180, 0.28, "triangle", 0.045],
    record: [430, 920, 0.42, "triangle", 0.065],
  };
  const sound = sounds[type];
  if (!sound) return;

  const [from, to, duration, wave, volume] = sound;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function loop(now) {
  const dt = Math.min(50, Math.max(0, now - lastTime));
  lastTime = now;
  if (gameState === "playing") updateGame(dt);
  else updateAmbient(dt);
  updateEffects(dt);
  draw();
  requestAnimationFrame(loop);
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

canvas.addEventListener("pointerdown", handleShot, { passive: false });
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
ui.startButton.addEventListener("click", startGame);
ui.againButton.addEventListener("click", startGame);
window.addEventListener("blur", () => { lastTime = performance.now(); });
document.addEventListener("visibilitychange", () => { lastTime = performance.now(); });

for (let index = 0; index < 4; index += 1) createBird(index === 2 ? "golden" : "regular", true);
updateHud();
requestAnimationFrame((now) => {
  lastTime = now;
  loop(now);
});
