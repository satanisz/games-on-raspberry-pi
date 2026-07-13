"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 492;
const STORAGE_KEY = "aikido_rewards_v1";

const ui = {
  startScreen: document.getElementById("start-screen"),
  resultScreen: document.getElementById("result-screen"),
  startButton: document.getElementById("start-button"),
  againButton: document.getElementById("again-button"),
  resetButton: document.getElementById("reset-button"),
  playerHealth: document.getElementById("player-health"),
  enemyHealth: document.getElementById("enemy-health"),
  playerHealthText: document.getElementById("player-health-text"),
  enemyHealthText: document.getElementById("enemy-health-text"),
  fightNumber: document.getElementById("fight-number"),
  enemyName: document.getElementById("enemy-name"),
  enemyRole: document.getElementById("enemy-role"),
  missionTitle: document.getElementById("mission-title"),
  missionDescription: document.getElementById("mission-description"),
  message: document.getElementById("message"),
  resultKicker: document.getElementById("result-kicker"),
  resultTitle: document.getElementById("result-title"),
  resultDescription: document.getElementById("result-description"),
  earnedRewards: document.getElementById("earned-rewards"),
  totals: {
    gold: document.getElementById("gold-total"),
    diamonds: document.getElementById("diamond-total"),
    coins: document.getElementById("coin-total"),
    trophies: document.getElementById("trophy-total"),
    medals: document.getElementById("medal-total"),
  },
};

const REWARD_INFO = {
  gold: { icon: "🪙", label: "złota" },
  diamonds: { icon: "💎", label: "diamentów" },
  coins: { icon: "💰", label: "pieniędzy" },
  trophies: { icon: "🏆", label: "pucharów" },
  medals: { icon: "🏅", label: "medali" },
};

let rewards = loadRewards();
let gameState = "menu";
let fightNumber = Math.max(1, rewards.wins + 1);
let lastTime = performance.now();
let screenShake = 0;
let audioContext = null;
let endTimer = null;
const keys = Object.create(null);
const particles = [];
const mist = createMist();

function createFighter(config) {
  return {
    ...config,
    health: 100,
    velocity: 0,
    y: 0,
    verticalVelocity: 0,
    attack: null,
    cooldown: 0,
    hitFlash: 0,
    defeated: false,
    walkCycle: 0,
  };
}

let player = createFighter({
  name: "Staś",
  kind: "stas",
  x: 230,
  facing: 1,
  body: "#167fc8",
  bodyLight: "#45b8f5",
  belt: "#e8edf2",
  skin: "#e3ad83",
  hair: "#4b2c20",
});

function getOpponentConfig() {
  if (fightNumber % 2 === 0) {
    return {
      name: "Agent",
      kind: "agent",
      role: "AGENT",
      mission: "Agent przeniknął do dojo. Powstrzymaj go, zanim zabierze wszystkie skarby.",
      x: 860,
      facing: -1,
      body: "#252936",
      bodyLight: "#626a7d",
      belt: "#383d4c",
      skin: "#d7a17a",
      hair: "#18191f",
      speed: 132,
    };
  }

  return {
    name: "Zły Sensei",
    kind: "sensei",
    role: "SZEF",
    mission: "Sensei opanował mroczne dojo. Tylko Staś może go zatrzymać i odzyskać skarby.",
    x: 860,
    facing: -1,
    body: "#661423",
    bodyLight: "#c52c42",
    belt: "#15151b",
    skin: "#d19a73",
    hair: "#d8d8d8",
    speed: 118,
  };
}

let enemy = createFighter(getOpponentConfig());

function defaultRewards() {
  return { gold: 0, diamonds: 0, coins: 0, trophies: 0, medals: 0, wins: 0 };
}

function loadRewards() {
  try {
    return { ...defaultRewards(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaultRewards();
  }
}

function saveRewards() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rewards));
  } catch {
    // Gra nadal działa, nawet jeśli przeglądarka blokuje pamięć lokalną.
  }
}

function updateRewardUI() {
  Object.keys(ui.totals).forEach((key) => {
    ui.totals[key].textContent = rewards[key].toLocaleString("pl-PL");
  });
  ui.fightNumber.textContent = fightNumber;
}

function updateOpponentUI() {
  const opponent = getOpponentConfig();
  ui.enemyName.textContent = opponent.name.toUpperCase();
  ui.enemyRole.textContent = opponent.role;
  ui.missionTitle.textContent = `Pokonaj: ${opponent.name}`;
  ui.missionDescription.textContent = opponent.mission;
  canvas.setAttribute("aria-label", `Staś walczy z przeciwnikiem: ${opponent.name}`);
}

function resetFight() {
  clearTimeout(endTimer);
  endTimer = null;
  player = createFighter({ ...player, x: 230, facing: 1 });
  enemy = createFighter(getOpponentConfig());
  updateOpponentUI();
  particles.length = 0;
  screenShake = 0;
  Object.keys(keys).forEach((key) => { keys[key] = false; });
  updateHealthUI();
}

function startFight() {
  initAudio();
  resetFight();
  gameState = "playing";
  ui.startScreen.classList.remove("visible");
  ui.resultScreen.classList.remove("visible");
  showMessage("WALCZ!");
  playSound("start");
}

function showMessage(text) {
  ui.message.textContent = text;
  ui.message.classList.remove("show");
  void ui.message.offsetWidth;
  ui.message.classList.add("show");
}

function updateHealthUI() {
  const playerHealth = Math.max(0, Math.round(player.health));
  const enemyHealth = Math.max(0, Math.round(enemy.health));
  ui.playerHealth.style.width = `${playerHealth}%`;
  ui.enemyHealth.style.width = `${enemyHealth}%`;
  ui.playerHealthText.textContent = playerHealth;
  ui.enemyHealthText.textContent = enemyHealth;
}

function beginAttack(fighter, type) {
  if (gameState !== "playing" || fighter.cooldown > 0 || fighter.defeated) return;

  const isKick = type === "kick";
  fighter.attack = { type, duration: isKick ? 320 : 240, remaining: isKick ? 320 : 240 };
  fighter.cooldown = isKick ? 640 : 420;

  const target = fighter === player ? enemy : player;
  const distance = Math.abs(target.x - fighter.x);
  const range = isKick ? 151 : 124;
  const inFront = Math.sign(target.x - fighter.x) === fighter.facing;
  const sameHeight = Math.abs(target.y - fighter.y) < 105;

  playSound(isKick ? "kick" : "swing");

  if (distance <= range && inFront && sameHeight && !target.defeated) {
    const damage = fighter === player
      ? (isKick ? randomInt(14, 18) : randomInt(9, 12))
      : (isKick ? randomInt(7, 9) : randomInt(5, 7));
    hitFighter(target, damage, fighter.facing, isKick);
  }
}

function hitFighter(target, damage, direction, heavy) {
  target.health = Math.max(0, target.health - damage);
  target.hitFlash = 150;
  target.velocity = direction * (heavy ? 95 : 55);
  screenShake = heavy ? 9 : 5;
  spawnImpact(target.x - direction * 35, GROUND_Y + target.y - 105, heavy ? 13 : 8, target === enemy ? "#55c5ff" : "#ff4c63");
  playSound("hit");
  updateHealthUI();

  if (target.health <= 0 && !target.defeated) {
    target.defeated = true;
    finishFight(target === enemy);
  }
}

function finishFight(playerWon) {
  gameState = "ending";
  Object.keys(keys).forEach((key) => { keys[key] = false; });
  playSound(playerWon ? "victory" : "defeat");

  endTimer = setTimeout(() => {
    if (playerWon) {
      const earned = {
        gold: randomInt(35, 75),
        diamonds: randomInt(1, 3),
        coins: randomInt(90, 190),
        trophies: 1,
        medals: randomInt(1, 2),
      };

      Object.keys(earned).forEach((key) => { rewards[key] += earned[key]; });
      rewards.wins += 1;
      fightNumber = rewards.wins + 1;
      saveRewards();
      updateRewardUI();
      showResult(true, earned);
    } else {
      showResult(false, null);
    }
  }, 950);
}

function showResult(won, earned) {
  gameState = "result";
  ui.resultKicker.textContent = won ? "ZWYCIĘSTWO" : "PORAŻKA";
  ui.resultKicker.style.color = won ? "#ffc44a" : "#ff5268";
  ui.resultTitle.textContent = won ? `${enemy.name} pokonany!` : `${enemy.name} zwycięża`;
  ui.resultDescription.textContent = won
    ? "Staś uratował dojo. Oto nagrody zdobyte w tej walce:"
    : "Staś upadł, ale może spróbować ponownie. Tym razem nagrody nie przepadają.";
  ui.againButton.textContent = won ? "NASTĘPNA WALKA" : "SPRÓBUJ PONOWNIE";
  ui.earnedRewards.innerHTML = "";

  if (earned) {
    Object.entries(earned).forEach(([key, value]) => {
      const item = document.createElement("div");
      item.className = "earned-reward";
      item.title = REWARD_INFO[key].label;
      item.innerHTML = `<span>${REWARD_INFO[key].icon}</span><b>+${value}</b>`;
      ui.earnedRewards.appendChild(item);
    });
  }

  ui.earnedRewards.style.display = earned ? "grid" : "none";
  ui.resultScreen.classList.add("visible");
}

function update(dt) {
  updateMist(dt);
  updateParticles(dt);
  screenShake = Math.max(0, screenShake - dt * 0.035);

  if (gameState !== "playing" && gameState !== "ending") {
    player.walkCycle += dt * 0.001;
    enemy.walkCycle += dt * 0.001;
    return;
  }

  updateFighterTimers(player, dt);
  updateFighterTimers(enemy, dt);

  if (gameState === "playing") {
    updatePlayer(dt);
    updateEnemy(dt);
  }

  separateFighters();
  player.facing = player.x < enemy.x ? 1 : -1;
  enemy.facing = enemy.x < player.x ? 1 : -1;
}

function updateFighterTimers(fighter, dt) {
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
  if (fighter.attack) {
    fighter.attack.remaining -= dt;
    if (fighter.attack.remaining <= 0) fighter.attack = null;
  }
  fighter.x += fighter.velocity * dt / 1000;
  fighter.velocity *= Math.pow(0.003, dt / 1000);
  fighter.verticalVelocity += 1500 * dt / 1000;
  fighter.y += fighter.verticalVelocity * dt / 1000;
  if (fighter.y >= 0) {
    fighter.y = 0;
    fighter.verticalVelocity = 0;
  }
  fighter.x = clamp(fighter.x, 82, WIDTH - 82);
}

function jump(fighter) {
  if (gameState !== "playing" || fighter.defeated || fighter.y < 0 || fighter.hitFlash > 80) return;
  fighter.verticalVelocity = -620;
  fighter.y = -1;
  playSound("jump");
}

function updatePlayer(dt) {
  if (player.defeated || player.hitFlash > 80) return;
  let direction = 0;
  if (keys.ArrowLeft) direction -= 1;
  if (keys.ArrowRight) direction += 1;
  if (direction && !player.attack) {
    player.x += direction * 245 * dt / 1000;
    player.walkCycle += dt * 0.014;
  }
  player.x = clamp(player.x, 72, WIDTH - 72);
}

function updateEnemy(dt) {
  if (enemy.defeated || enemy.hitFlash > 80 || enemy.attack) return;
  const delta = player.x - enemy.x;
  const distance = Math.abs(delta);

  if (distance > 116) {
    enemy.x += Math.sign(delta) * enemy.speed * dt / 1000;
    enemy.walkCycle += dt * 0.009;
  } else if (enemy.cooldown <= 0) {
    beginAttack(enemy, Math.random() < 0.72 ? "punch" : "kick");
    enemy.cooldown += randomInt(520, 820);
  }
}

function separateFighters() {
  const minDistance = 72;
  const delta = enemy.x - player.x;
  if (Math.abs(delta) < minDistance) {
    const push = (minDistance - Math.abs(delta)) / 2;
    const direction = delta >= 0 ? 1 : -1;
    player.x -= push * direction;
    enemy.x += push * direction;
  }
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }
  drawArena();
  drawMist();
  drawFighter(player, false);
  drawFighter(enemy, true);
  drawParticles();
  ctx.restore();

  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(40, now - lastTime);
  lastTime = now;
  update(dt);
  draw();
}

function drawArena() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#080911");
  sky.addColorStop(0.62, "#15121a");
  sky.addColorStop(1, "#09090d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Księżyc za oknami dojo.
  const moonGlow = ctx.createRadialGradient(550, 150, 20, 550, 150, 160);
  moonGlow.addColorStop(0, "rgba(205,222,235,0.22)");
  moonGlow.addColorStop(0.4, "rgba(126,158,177,0.08)");
  moonGlow.addColorStop(1, "rgba(60,80,100,0)");
  ctx.fillStyle = moonGlow;
  ctx.fillRect(360, 0, 380, 340);
  ctx.fillStyle = "#aebac0";
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.arc(550, 150, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Drewniane belki i papierowe ściany.
  ctx.fillStyle = "#241a1b";
  ctx.fillRect(0, 72, WIDTH, 22);
  ctx.fillRect(0, 340, WIDTH, 18);
  for (let x = 22; x < WIDTH; x += 154) {
    ctx.fillRect(x, 52, 18, 306);
  }

  ctx.strokeStyle = "rgba(174,185,192,0.09)";
  ctx.lineWidth = 2;
  for (let x = 40; x < WIDTH; x += 154) {
    for (let y = 112; y < 335; y += 55) {
      ctx.strokeRect(x, y, 136, 55);
    }
  }

  // Czerwone lampiony.
  [108, 990].forEach((x) => {
    const glow = ctx.createRadialGradient(x, 160, 2, x, 160, 85);
    glow.addColorStop(0, "rgba(255,56,67,0.3)");
    glow.addColorStop(1, "rgba(255,56,67,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 90, 70, 180, 180);
    ctx.strokeStyle = "#4b2428";
    ctx.beginPath();
    ctx.moveTo(x, 91);
    ctx.lineTo(x, 120);
    ctx.stroke();
    ctx.fillStyle = "#9f2633";
    roundedRect(x - 18, 120, 36, 58, 12);
    ctx.fill();
    ctx.fillStyle = "rgba(255,135,91,0.4)";
    ctx.fillRect(x - 12, 126, 6, 44);
  });

  // Znak Aikido.
  ctx.save();
  ctx.translate(550, 225);
  ctx.rotate(-0.04);
  ctx.fillStyle = "rgba(4,4,7,0.64)";
  ctx.fillRect(-72, -65, 144, 120);
  ctx.strokeStyle = "rgba(183,38,53,0.45)";
  ctx.strokeRect(-72, -65, 144, 120);
  ctx.fillStyle = "rgba(225,225,218,0.32)";
  ctx.font = "72px serif";
  ctx.textAlign = "center";
  ctx.fillText("合", 0, 30);
  ctx.restore();

  // Podłoga dojo.
  const floor = ctx.createLinearGradient(0, 350, 0, HEIGHT);
  floor.addColorStop(0, "#1a171a");
  floor.addColorStop(1, "#08080b");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 358, WIDTH, HEIGHT - 358);
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let y = 378; y < HEIGHT; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  for (let x = -200; x < WIDTH + 200; x += 115) {
    ctx.beginPath();
    ctx.moveTo(550 + (x - 550) * 0.32, 358);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,0.34)";
  ctx.beginPath();
  ctx.ellipse(player.x, GROUND_Y + 5, 62, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(enemy.x, GROUND_Y + 5, 62, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighter(fighter, isEnemy) {
  const isAgent = fighter.kind === "agent";
  const isSensei = fighter.kind === "sensei";
  ctx.save();
  ctx.translate(fighter.x, GROUND_Y + fighter.y);
  ctx.scale(fighter.facing, 1);

  if (fighter.defeated) {
    ctx.translate(fighter.facing * 28, -5);
    ctx.rotate(fighter.facing * 1.35);
    ctx.translate(0, 65);
  }

  const moving = Math.abs(fighter.velocity) > 5 || (fighter === player && (keys.ArrowLeft || keys.ArrowRight));
  const walk = moving && !fighter.defeated ? Math.sin(fighter.walkCycle) : 0;
  const attackProgress = fighter.attack
    ? 1 - fighter.attack.remaining / fighter.attack.duration
    : 0;
  const strike = fighter.attack ? Math.sin(attackProgress * Math.PI) : 0;

  if (fighter.hitFlash > 0 && Math.floor(fighter.hitFlash / 35) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  // Nogi.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = fighter.body;
  ctx.beginPath();
  if (fighter.attack?.type === "kick") {
    ctx.moveTo(3, -55);
    ctx.lineTo(26 + strike * 44, -35 - strike * 20);
    ctx.lineTo(44 + strike * 58, -4 - strike * 58);
    ctx.moveTo(-7, -55);
    ctx.lineTo(-14, -27);
    ctx.lineTo(-20, 0);
  } else {
    ctx.moveTo(3, -57);
    ctx.lineTo(16 + walk * 9, -29);
    ctx.lineTo(19 + walk * 13, 0);
    ctx.moveTo(-7, -57);
    ctx.lineTo(-14 - walk * 9, -29);
    ctx.lineTo(-17 - walk * 13, 0);
  }
  ctx.stroke();

  // Stopy.
  ctx.strokeStyle = "#15151a";
  ctx.lineWidth = 10;
  ctx.beginPath();
  if (fighter.attack?.type === "kick") {
    ctx.moveTo(36 + strike * 59, -2 - strike * 58);
    ctx.lineTo(50 + strike * 62, -2 - strike * 58);
    ctx.moveTo(-25, 0);
    ctx.lineTo(-8, 0);
  } else {
    ctx.moveTo(11 + walk * 13, 0);
    ctx.lineTo(28 + walk * 13, 0);
    ctx.moveTo(-25 - walk * 13, 0);
    ctx.lineTo(-8 - walk * 13, 0);
  }
  ctx.stroke();

  // Tułów stroju.
  const bodyGradient = ctx.createLinearGradient(-30, -130, 35, -55);
  bodyGradient.addColorStop(0, fighter.bodyLight);
  bodyGradient.addColorStop(0.55, fighter.body);
  bodyGradient.addColorStop(1, "#0d1119");
  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(-28, -124);
  ctx.quadraticCurveTo(0, -139, 30, -120);
  ctx.lineTo(26, -59);
  ctx.quadraticCurveTo(0, -49, -29, -60);
  ctx.closePath();
  ctx.fill();

  if (isAgent) {
    // Biała koszula, klapy marynarki i czerwony krawat Agenta.
    ctx.fillStyle = "#d9dde5";
    ctx.beginPath();
    ctx.moveTo(-13, -123);
    ctx.lineTo(13, -123);
    ctx.lineTo(3, -82);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#11131a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-21, -121);
    ctx.lineTo(-2, -88);
    ctx.lineTo(-18, -74);
    ctx.moveTo(21, -121);
    ctx.lineTo(3, -88);
    ctx.stroke();
    ctx.fillStyle = "#bf263a";
    ctx.beginPath();
    ctx.moveTo(-4, -116);
    ctx.lineTo(5, -116);
    ctx.lineTo(8, -89);
    ctx.lineTo(1, -79);
    ctx.lineTo(-6, -89);
    ctx.closePath();
    ctx.fill();
  } else {
    // Klapy stroju aikido.
    ctx.strokeStyle = isEnemy ? "#39101a" : "#d9edf8";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-19, -120);
    ctx.lineTo(13, -82);
    ctx.lineTo(-7, -60);
    ctx.moveTo(19, -119);
    ctx.lineTo(-8, -83);
    ctx.stroke();
  }

  // Pas.
  ctx.strokeStyle = fighter.belt;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-28, -62);
  ctx.lineTo(27, -62);
  ctx.stroke();
  ctx.fillStyle = fighter.belt;
  ctx.beginPath();
  ctx.arc(2, -62, 7, 0, Math.PI * 2);
  ctx.fill();

  // Ręce, podczas ciosu prawa ręka wysuwa się do przodu.
  ctx.strokeStyle = fighter.body;
  ctx.lineWidth = 17;
  ctx.beginPath();
  ctx.moveTo(-23, -112);
  ctx.lineTo(-40, -86 + walk * 2);
  ctx.lineTo(-25, -69);
  ctx.moveTo(24, -111);
  if (fighter.attack?.type === "punch") {
    ctx.lineTo(54 + strike * 32, -101);
    ctx.lineTo(66 + strike * 48, -102);
  } else {
    ctx.lineTo(45, -89);
    ctx.lineTo(31, -72);
  }
  ctx.stroke();

  ctx.fillStyle = fighter.skin;
  ctx.beginPath();
  ctx.arc(-23, -68, 10, 0, Math.PI * 2);
  if (fighter.attack?.type === "punch") {
    ctx.arc(68 + strike * 48, -102, 10, 0, Math.PI * 2);
  } else {
    ctx.arc(29, -70, 10, 0, Math.PI * 2);
  }
  ctx.fill();

  // Głowa.
  ctx.fillStyle = fighter.skin;
  ctx.beginPath();
  ctx.arc(0, -153, 29, 0, Math.PI * 2);
  ctx.fill();

  // Włosy.
  ctx.fillStyle = fighter.hair;
  ctx.beginPath();
  ctx.arc(-2, -161, 28, Math.PI, Math.PI * 1.98);
  ctx.lineTo(26, -153);
  if (isSensei) {
    ctx.lineTo(19, -177);
    ctx.lineTo(7, -169);
    ctx.lineTo(-6, -181);
    ctx.lineTo(-15, -169);
    ctx.lineTo(-28, -174);
  }
  ctx.closePath();
  ctx.fill();

  if (isAgent) {
    // Ciemne okulary Agenta.
    ctx.fillStyle = "#08090d";
    roundedRect(2, -162, 25, 13, 4);
    ctx.fill();
    ctx.strokeStyle = "#6e7585";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -157);
    ctx.lineTo(4, -157);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(17, -159, 5, 2);
  } else {
    // Oczy i brwi.
    ctx.strokeStyle = isEnemy ? "#4e0a13" : "#2b211d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(7, -159);
    ctx.lineTo(18, isEnemy ? -157 : -159);
    ctx.stroke();
    ctx.fillStyle = isEnemy ? "#ff334c" : "#15202a";
    ctx.beginPath();
    ctx.arc(14, -154, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isSensei) {
    // Broda Sensei.
    ctx.fillStyle = "#bfc0c5";
    ctx.beginPath();
    ctx.moveTo(3, -135);
    ctx.lineTo(20, -141);
    ctx.lineTo(14, -119);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // Imię nad postacią.
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillStyle = isAgent
    ? "rgba(187,170,255,0.9)"
    : (isEnemy ? "rgba(255,100,115,0.86)" : "rgba(110,202,255,0.9)");
  ctx.fillText(fighter.name.toUpperCase(), fighter.x, GROUND_Y + fighter.y - 201);
  ctx.restore();
}

function createMist() {
  return Array.from({ length: 14 }, () => ({
    x: Math.random() * WIDTH,
    y: randomInt(355, 560),
    radius: randomInt(35, 95),
    speed: randomInt(4, 13),
    alpha: Math.random() * 0.025 + 0.012,
  }));
}

function updateMist(dt) {
  mist.forEach((cloud) => {
    cloud.x += cloud.speed * dt / 1000;
    if (cloud.x - cloud.radius > WIDTH) cloud.x = -cloud.radius;
  });
}

function drawMist() {
  mist.forEach((cloud) => {
    const gradient = ctx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.radius);
    gradient.addColorStop(0, `rgba(185,205,220,${cloud.alpha})`);
    gradient.addColorStop(1, "rgba(160,180,200,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function spawnImpact(x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomInt(70, 230);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomInt(180, 420),
      maxLife: 420,
      size: randomInt(2, 6),
      color,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt / 1000;
    particle.y += particle.vy * dt / 1000;
    particle.vy += 210 * dt / 1000;
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
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
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  const sound = {
    swing: [190, 80, 0.08, "sine", 0.05],
    kick: [140, 55, 0.12, "sawtooth", 0.07],
    jump: [170, 310, 0.14, "sine", 0.04],
    hit: [90, 40, 0.09, "square", 0.085],
    start: [220, 440, 0.25, "triangle", 0.055],
    victory: [330, 660, 0.5, "triangle", 0.07],
    defeat: [180, 55, 0.55, "sawtooth", 0.05],
  }[type];

  if (!sound) return;
  const [from, to, duration, wave, volume] = sound;
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, now);
  oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function handleKeyDown(event) {
  const code = event.code;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyX"].includes(code)) return;
  event.preventDefault();
  keys[code] = true;
  if (!event.repeat && code === "ArrowUp") jump(player);
  if (!event.repeat && code === "Space") beginAttack(player, "punch");
  if (!event.repeat && code === "KeyX") beginAttack(player, "kick");
}

function handleKeyUp(event) {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyX"].includes(event.code)) {
    event.preventDefault();
    keys[event.code] = false;
  }
}

document.addEventListener("keydown", handleKeyDown, { passive: false });
document.addEventListener("keyup", handleKeyUp, { passive: false });
window.addEventListener("blur", () => {
  Object.keys(keys).forEach((key) => { keys[key] = false; });
  document.querySelectorAll(".control-button").forEach((button) => button.classList.remove("pressed"));
});

document.querySelectorAll(".control-button").forEach((button) => {
  const key = button.dataset.key;
  const activePointers = new Set();
  const press = (event) => {
    event.preventDefault();
    if (!button.classList.contains("pressed")) activePointers.clear();
    activePointers.add(event.pointerId);
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {
      // Nie każda starsza przeglądarka mobilna obsługuje przechwytywanie dotyku.
    }
    button.classList.add("pressed");
    keys[key] = true;
    navigator.vibrate?.(key === "ArrowLeft" || key === "ArrowRight" ? 5 : 12);
    if (key === "ArrowUp") jump(player);
    if (key === "Space") beginAttack(player, "punch");
    if (key === "KeyX") beginAttack(player, "kick");
  };
  const release = (event) => {
    event.preventDefault();
    activePointers.delete(event.pointerId);
    button.classList.toggle("pressed", activePointers.size > 0);
    keys[key] = activePointers.size > 0;
  };
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
});

ui.startButton.addEventListener("click", startFight);
ui.againButton.addEventListener("click", startFight);
ui.resetButton.addEventListener("click", () => {
  if (!window.confirm("Wyzerować wszystkie zdobyte nagrody i liczbę zwycięstw?")) return;
  rewards = defaultRewards();
  fightNumber = 1;
  saveRewards();
  updateRewardUI();
});

updateRewardUI();
updateOpponentUI();
updateHealthUI();
requestAnimationFrame((now) => {
  lastTime = now;
  draw();
});
