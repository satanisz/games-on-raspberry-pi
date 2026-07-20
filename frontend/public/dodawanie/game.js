"use strict";

const TOTAL_LEVELS = 30;
const MAX_RESULT = 20;
const ANIMALS = ["cat", "bird", "panda", "onigiri", "bats"];
const ANSWER_COLORS = [
  ["#ffe38d", "#d3a833"],
  ["#aee7cf", "#67b892"],
  ["#ffc0b5", "#d77969"],
  ["#c7c0f2", "#8c81c8"],
];

const ui = {
  startScreen: document.getElementById("start-screen"),
  endScreen: document.getElementById("end-screen"),
  endCard: document.querySelector(".end-card"),
  startButton: document.getElementById("start-button"),
  againButton: document.getElementById("again-button"),
  soundButton: document.getElementById("sound-button"),
  levelLabel: document.getElementById("level-label"),
  levelCount: document.getElementById("level-count"),
  progressBar: document.getElementById("progress-bar"),
  hearts: [...document.querySelectorAll("#hearts span")],
  speechBubble: document.getElementById("speech-bubble"),
  animal: document.getElementById("animal"),
  challenge: document.getElementById("challenge"),
  modeKicker: document.getElementById("mode-kicker"),
  instruction: document.getElementById("instruction"),
  leftNumber: document.getElementById("left-number"),
  rightNumber: document.getElementById("right-number"),
  resultNumber: document.getElementById("result-number"),
  timerBar: document.getElementById("timer-bar"),
  answers: document.getElementById("answers"),
  feedback: document.getElementById("feedback"),
  endKicker: document.getElementById("end-kicker"),
  endTitle: document.getElementById("end-title"),
  endMessage: document.getElementById("end-message"),
  animalParade: document.getElementById("animal-parade"),
};

let levels = [];
let currentLevelIndex = 0;
let hearts = 3;
let gameState = "intro";
let soundEnabled = true;
let memoryTimeout = null;
let transitionTimeout = null;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function maximumSumForLevel(levelNumber) {
  if (levelNumber <= 10) return 6 + Math.floor((levelNumber - 1) * 4 / 9);
  if (levelNumber <= 20) return 11 + Math.floor((levelNumber - 11) * 4 / 9);
  return 16 + Math.floor((levelNumber - 21) * 4 / 9);
}

function buildLevels() {
  const usedEquations = new Set();
  const generated = [];

  for (let index = 0; index < TOTAL_LEVELS; index += 1) {
    const levelNumber = index + 1;
    const maxSum = maximumSumForLevel(levelNumber);
    const minSum = Math.max(2, maxSum - 5);
    let left;
    let right;
    let key;
    let attempts = 0;

    do {
      const sum = randomInt(minSum, maxSum);
      left = randomInt(1, sum - 1);
      right = sum - left;
      key = `${Math.min(left, right)}+${Math.max(left, right)}`;
      attempts += 1;
    } while (usedEquations.has(key) && attempts < 80);

    usedEquations.add(key);
    const result = left + right;
    generated.push({
      left,
      right,
      result,
      animal: ANIMALS[index % ANIMALS.length],
      memoryMs: Math.round(10000 - (index / (TOTAL_LEVELS - 1)) * 7000),
      answers: createAnswers(result),
    });
  }

  return generated;
}

function createAnswers(correct) {
  const values = new Set([correct]);
  const preferredOffsets = shuffle([-1, 1, -2, 2, -3, 3, -4, 4, -5, 5]);

  for (const offset of preferredOffsets) {
    const candidate = correct + offset;
    if (candidate >= 0 && candidate <= MAX_RESULT) values.add(candidate);
    if (values.size === 4) break;
  }

  while (values.size < 4) values.add(randomInt(0, MAX_RESULT));
  return shuffle([...values]);
}

function startGame() {
  clearTimers();
  cancelSpeech();
  levels = buildLevels();
  currentLevelIndex = 0;
  ui.startScreen.classList.remove("visible");
  ui.endScreen.classList.remove("visible");
  ui.endCard.classList.remove("win");
  startLevel(true);
}

function startLevel(isFirstLevel = false) {
  clearTimers();
  window.scrollTo(0, 0);
  const level = levels[currentLevelIndex];
  if (currentLevelIndex % 3 === 0) hearts = 3;
  gameState = "memory";

  ui.levelLabel.textContent = `Poziom ${currentLevelIndex + 1}`;
  ui.levelCount.textContent = `${currentLevelIndex + 1} / ${TOTAL_LEVELS}`;
  ui.progressBar.style.width = `${((currentLevelIndex + 1) / TOTAL_LEVELS) * 100}%`;
  updateHearts();
  setAnimal(level.animal);
  ui.leftNumber.textContent = String(level.left);
  ui.rightNumber.textContent = String(level.right);
  ui.resultNumber.textContent = String(level.result);
  ui.resultNumber.classList.remove("question-mark");
  ui.modeKicker.textContent = "ZAPAMIĘTAJ";
  ui.instruction.textContent = "Zapamiętaj działanie";
  ui.feedback.textContent = "";
  ui.answers.replaceChildren();
  ui.challenge.classList.add("memory-state");
  ui.challenge.classList.remove("answer-state");
  setSpeechBubble("Zapamiętaj działanie");

  ui.timerBar.classList.remove("running");
  ui.timerBar.style.setProperty("--memory-time", `${level.memoryMs}ms`);
  void ui.timerBar.offsetWidth;
  ui.timerBar.classList.add("running");

  const welcome = isFirstLevel ? "Witaj w świecie dodawania. " : "";
  speak(`${welcome}Zapamiętaj działanie. ${level.left} plus ${level.right} równa się ${level.result}.`);
  memoryTimeout = window.setTimeout(showAnswers, level.memoryMs);
}

function showAnswers() {
  if (gameState !== "memory") return;
  window.scrollTo(0, 0);
  const level = levels[currentLevelIndex];
  gameState = "answer";
  ui.challenge.classList.remove("memory-state");
  ui.challenge.classList.add("answer-state");
  ui.modeKicker.textContent = "TWOJA KOLEJ";
  ui.instruction.textContent = "Wpisz prawidłową liczbę";
  ui.resultNumber.textContent = "?";
  ui.resultNumber.classList.add("question-mark");
  setSpeechBubble("Wpisz prawidłową liczbę");

  level.answers.forEach((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    button.textContent = String(value);
    button.setAttribute("aria-label", `Odpowiedź ${value}`);
    button.style.setProperty("--answer-color", ANSWER_COLORS[index][0]);
    button.style.setProperty("--answer-shadow", ANSWER_COLORS[index][1]);
    button.addEventListener("click", () => selectAnswer(value, button));
    ui.answers.append(button);
  });

  speak("Wpisz prawidłową liczbę.");
}

function selectAnswer(value, button) {
  if (gameState !== "answer") return;
  const level = levels[currentLevelIndex];

  if (value === level.result) {
    gameState = "transition";
    button.classList.add("correct");
    ui.resultNumber.textContent = String(level.result);
    ui.resultNumber.classList.remove("question-mark");
    ui.feedback.textContent = "Brawo!";
    setSpeechBubble("Brawo!");
    animateAnimal("celebrate");
    speak("Brawo!");
    navigator.vibrate?.(20);
    transitionTimeout = window.setTimeout(nextLevel, 1150);
    return;
  }

  hearts -= 1;
  button.classList.add("wrong");
  button.disabled = true;
  updateHearts();
  animateAnimal("oops");
  navigator.vibrate?.([35, 40, 35]);

  if (hearts > 0) {
    const message = `${value} to zła odpowiedź`;
    ui.feedback.textContent = `${message}. Spróbuj jeszcze raz.`;
    setSpeechBubble(`${message}.`);
    speak(`${value} to zła odpowiedź. Spróbuj jeszcze raz.`);
  } else {
    gameState = "transition";
    const message = "Nie masz już serduszek";
    ui.feedback.textContent = message;
    setSpeechBubble(message);
    speak(`${value} to zła odpowiedź. ${message}.`);
    transitionTimeout = window.setTimeout(() => showEndScreen(false), 1400);
  }
}

function nextLevel() {
  currentLevelIndex += 1;
  if (currentLevelIndex >= TOTAL_LEVELS) {
    showEndScreen(true);
    return;
  }
  startLevel(false);
}

function showEndScreen(won) {
  clearTimers();
  gameState = won ? "won" : "lost";
  buildAnimalParade();
  ui.endCard.classList.toggle("win", won);
  ui.endKicker.textContent = won ? "30 POZIOMÓW UKOŃCZONE" : "KONIEC GRY";
  ui.endTitle.textContent = won ? "Brawo!" : "Przegrałeś";
  ui.endMessage.textContent = won ? "Brawo, ukończyłeś grę Dodawanie!" : "Nie masz już serduszek.";
  ui.endScreen.classList.add("visible");
  speak(won ? "Brawo, ukończyłeś grę Dodawanie!" : "Nie masz już serduszek. Przegrałeś.");
}

function setAnimal(name) {
  ui.animal.className = `animal-figure animal-${name}`;
}

function animateAnimal(className) {
  ui.animal.classList.remove("celebrate", "oops");
  void ui.animal.offsetWidth;
  ui.animal.classList.add(className);
  window.setTimeout(() => ui.animal.classList.remove(className), 700);
}

function setSpeechBubble(message) {
  ui.speechBubble.textContent = message;
  ui.speechBubble.classList.remove("pop");
  void ui.speechBubble.offsetWidth;
  ui.speechBubble.classList.add("pop");
}

function updateHearts() {
  ui.hearts.forEach((heart, index) => heart.classList.toggle("lost", index >= hearts));
  const label = hearts === 1 ? "Jedno serduszko" : `${hearts} serduszka`;
  document.getElementById("hearts").setAttribute("aria-label", label);
}

function buildAnimalParade() {
  ui.animalParade.replaceChildren();
  ANIMALS.forEach((animal, index) => {
    const figure = document.createElement("div");
    figure.className = `animal-figure animal-${animal}`;
    figure.style.setProperty("--parade-index", String(index));
    ui.animalParade.append(figure);
  });
}

function findPolishVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.toLowerCase() === "pl-pl")
    || voices.find((voice) => voice.lang.toLowerCase().startsWith("pl"))
    || null;
}

function speak(message) {
  if (!soundEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "pl-PL";
  utterance.rate = 0.92;
  utterance.pitch = 1.08;
  utterance.volume = 1;
  const voice = findPolishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function cancelSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  ui.soundButton.setAttribute("aria-pressed", String(!soundEnabled));
  ui.soundButton.textContent = soundEnabled ? "🔊 Głos włączony" : "🔇 Głos wyłączony";
  if (!soundEnabled) cancelSpeech();
  else speak("Głos włączony.");
}

function clearTimers() {
  window.clearTimeout(memoryTimeout);
  window.clearTimeout(transitionTimeout);
  memoryTimeout = null;
  transitionTimeout = null;
}

ui.startButton.addEventListener("click", startGame);
ui.againButton.addEventListener("click", startGame);
ui.soundButton.addEventListener("click", toggleSound);
window.addEventListener("pagehide", cancelSpeech);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelSpeech();
});

buildAnimalParade();
