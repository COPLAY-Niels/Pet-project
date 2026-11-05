"use strict";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DECKS = 6;
const MAX_HANDS = 4;
const START_BALANCE = 1000;
const STORAGE_KEY = "blackjack-balance";
const CHIP_VALUES = [500, 100, 50, 25, 10, 5, 1]; // til at vise gevinster som chips
const STACK_MAX = 10; // chips pr. stak før der startes en ny ved siden af

const $ = (id) => document.getElementById(id);
const el = {
  balance: $("balance"),
  bet: $("bet"),
  dealerHand: $("dealer-hand"),
  dealerScore: $("dealer-score"),
  playerHands: $("player-hands"),
  betSpot: $("bet-spot"),
  betStack: $("bet-stack"),
  message: $("message"),
  betting: $("betting"),
  actions: $("actions"),
  deal: $("deal"),
  clearBet: $("clear-bet"),
  hit: $("hit"),
  stand: $("stand"),
  double: $("double"),
  split: $("split"),
  reset: $("reset"),
};

const state = {
  shoe: [],
  hands: [],   // spillerens hænder: { cards, bet, chips, winChips, done, splitAces, result }
  active: 0,   // index på den hånd der spilles nu
  dealer: [],
  balance: loadBalance(),
  bet: 0,      // indsats under betting-fasen
  betChips: [], // de chips der er lagt på indsatsfeltet, i rækkefølge
  phase: "betting", // betting | playing | done
};

// ---------- Kortspil ----------

function buildShoe() {
  const shoe = [];
  for (let d = 0; d < DECKS; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) shoe.push({ rank, suit });
    }
  }
  // Fisher–Yates
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function draw() {
  // Bland igen når under 25 % af skoen er tilbage
  if (state.shoe.length < DECKS * 52 * 0.25) state.shoe = buildShoe();
  return state.shoe.pop();
}

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const total = (cards) => handValue(cards).total;
const isBlackjack = (cards) => cards.length === 2 && total(cards) === 21;
// 21 på to kort efter et split tæller som almindelig 21, ikke blackjack
const isNatural = (hand) => state.hands.length === 1 && isBlackjack(hand.cards);

function newHand(cards, bet, chips) {
  return { cards, bet, chips, winChips: [], done: false, splitAces: false, result: null };
}

// Del et beløb op i så få chips som muligt (største nederst i stakken)
function toChips(amount) {
  const chips = [];
  for (const v of CHIP_VALUES) {
    while (amount >= v) {
      chips.push(v);
      amount -= v;
    }
  }
  return chips;
}

const activeHand = () => state.hands[state.active];

// ---------- Saldo ----------

function loadBalance() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : START_BALANCE;
  } catch {
    return START_BALANCE;
  }
}

function saveBalance() {
  try { localStorage.setItem(STORAGE_KEY, String(state.balance)); } catch { /* ignorer */ }
}

// ---------- Regler for handlinger ----------

function canDouble() {
  const h = activeHand();
  return state.phase === "playing" && !!h && h.cards.length === 2 &&
    !h.splitAces && state.balance >= h.bet;
}

function canSplit() {
  const h = activeHand();
  return state.phase === "playing" && !!h && h.cards.length === 2 &&
    cardValue(h.cards[0]) === cardValue(h.cards[1]) &&
    state.hands.length < MAX_HANDS && state.balance >= h.bet;
}

// ---------- Rendering ----------

function renderCard(card, hidden = false) {
  const div = document.createElement("div");
  if (hidden) {
    div.className = "card back";
    return div;
  }
  const red = card.suit === "♥" || card.suit === "♦";
  div.className = `card ${red ? "red" : "black"}`;
  div.innerHTML =
    `<span class="corner tl">${card.rank}<br>${card.suit}</span>` +
    `<span class="pip">${card.suit}</span>` +
    `<span class="corner br">${card.rank}<br>${card.suit}</span>`;
  return div;
}

// Tegn kun de kort der er nye eller har skiftet (fx dealerens skjulte kort),
// så animationen ikke afspilles igen for kort der allerede ligger på bordet.
function renderHand(container, cards, hiddenIndex = -1) {
  const existing = container.children;
  while (existing.length > cards.length) container.lastChild.remove();
  cards.forEach((card, i) => {
    const hidden = i === hiddenIndex;
    const key = hidden ? "back" : card.rank + card.suit;
    const node = existing[i];
    if (node && node.dataset.key === key) return;
    const fresh = renderCard(card, hidden);
    fresh.dataset.key = key;
    node ? node.replaceWith(fresh) : container.appendChild(fresh);
  });
}

// Tegn chips som stakke. Kun nye chips tilføjes, så de "lander" med animation,
// mens chips der allerede ligger på bordet bliver liggende.
function renderStack(container, chips) {
  const nCols = Math.ceil(chips.length / STACK_MAX);
  while (container.children.length > nCols) container.lastChild.remove();
  while (container.children.length < nCols) {
    const col = document.createElement("div");
    col.className = "chip-col";
    container.appendChild(col);
  }
  [...container.children].forEach((col, c) => {
    const part = chips.slice(c * STACK_MAX, (c + 1) * STACK_MAX);
    while (col.children.length > part.length) col.lastChild.remove();
    part.forEach((value, i) => {
      const node = col.children[i];
      if (node && node.dataset.value === String(value)) return;
      const chip = document.createElement("div");
      chip.className = "mini-chip";
      chip.dataset.value = value;
      chip.textContent = value;
      chip.style.bottom = `${i * 5}px`;
      node ? node.replaceWith(chip) : col.appendChild(chip);
    });
    col.style.height = `${40 + (part.length - 1) * 5}px`;
  });
}

function scoreText(cards) {
  const { total, soft } = handValue(cards);
  return soft && total < 21 ? `${total - 10}/${total}` : String(total);
}

function renderPlayerHands() {
  const boxes = el.playerHands.children;
  while (boxes.length > state.hands.length) el.playerHands.lastChild.remove();
  while (boxes.length < state.hands.length) {
    const box = document.createElement("div");
    box.className = "hand-box";
    box.innerHTML =
      `<div class="hand-info"></div><div class="hand"></div>` +
      `<div class="stake"><div class="stack bet"></div><div class="stack win"></div></div>`;
    el.playerHands.appendChild(box);
  }

  const multi = state.hands.length > 1;
  el.playerHands.classList.toggle("multi", multi);

  state.hands.forEach((hand, i) => {
    const box = boxes[i];
    box.classList.toggle("active", multi && state.phase === "playing" && i === state.active);

    let info = `<span class="score">${scoreText(hand.cards)}</span>`;
    if (multi) info = `<span class="label">Hånd ${i + 1} · ${hand.bet} kr</span>` + info;
    if (hand.result) info += `<span class="result ${hand.result.cls}">${hand.result.label}</span>`;
    box.querySelector(".hand-info").innerHTML = info;

    renderHand(box.querySelector(".hand"), hand.cards);

    const betStack = box.querySelector(".stack.bet");
    renderStack(betStack, hand.chips);
    betStack.classList.toggle("lost", hand.result?.cls === "lose");
    renderStack(box.querySelector(".stack.win"), hand.winChips);
  });
}

function render() {
  const playing = state.phase === "playing";

  renderHand(el.dealerHand, state.dealer, playing ? 1 : -1);
  el.dealerScore.textContent = !state.dealer.length
    ? ""
    : playing
      ? String(cardValue(state.dealer[0]))
      : scoreText(state.dealer);

  renderPlayerHands();
  el.betSpot.classList.toggle("hidden", state.hands.length > 0);
  renderStack(el.betStack, state.betChips);

  el.balance.textContent = state.balance;
  el.bet.textContent = playing
    ? state.hands.reduce((sum, h) => sum + h.bet, 0)
    : state.bet;

  el.betting.classList.toggle("hidden", playing);
  el.actions.classList.toggle("hidden", !playing);

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.disabled = Number(chip.dataset.value) > state.balance;
  });
  el.deal.disabled = state.bet === 0;
  el.clearBet.disabled = state.bet === 0;
  el.double.disabled = !canDouble();
  el.split.disabled = !canSplit();

  const broke = !playing && state.balance === 0 && state.bet === 0;
  el.reset.classList.toggle("hidden", !broke);
}

function setMessage(text) {
  el.message.textContent = text;
}

function promptForActiveHand() {
  if (state.hands.length > 1) {
    setMessage(`Hånd ${state.active + 1}: træk, stå, doble eller split?`);
  } else {
    setMessage("Træk, stå, doble eller split?");
  }
}

// ---------- Spilforløb ----------

function addChip(value) {
  if (state.phase === "done") startNewBetting();
  if (value > state.balance) return;
  state.balance -= value;
  state.bet += value;
  state.betChips.push(value);
  setMessage("Klik på 'Giv kort' når du er klar.");
  render();
}

function removeLastChip() {
  if (state.phase !== "betting" || !state.betChips.length) return;
  const value = state.betChips.pop();
  state.balance += value;
  state.bet -= value;
  if (state.bet === 0) setMessage("Placér din indsats for at starte.");
  render();
}

function clearBet() {
  state.balance += state.bet;
  state.bet = 0;
  state.betChips = [];
  setMessage("Placér din indsats for at starte.");
  render();
}

function startNewBetting() {
  state.hands = [];
  state.dealer = [];
  state.active = 0;
  state.betChips = [];
  state.phase = "betting";
}

function deal() {
  if (state.bet === 0) return;
  state.hands = [newHand([draw(), draw()], state.bet, state.betChips)];
  state.dealer = [draw(), draw()];
  state.bet = 0;
  state.betChips = [];
  state.active = 0;
  state.phase = "playing";

  if (isBlackjack(state.hands[0].cards) || isBlackjack(state.dealer)) {
    finishRound();
    return;
  }
  promptForActiveHand();
  render();
}

function hit() {
  if (state.phase !== "playing") return;
  const h = activeHand();
  h.cards.push(draw());
  if (total(h.cards) >= 21) return nextHand();
  render();
}

function stand() {
  if (state.phase !== "playing") return;
  nextHand();
}

function doubleDown() {
  if (!canDouble()) return;
  const h = activeHand();
  state.balance -= h.bet;
  h.bet *= 2;
  h.chips = h.chips.concat(h.chips);
  h.cards.push(draw());
  nextHand();
}

function split() {
  if (!canSplit()) return;
  const h = activeHand();
  state.balance -= h.bet;

  const second = newHand([h.cards.pop()], h.bet, [...h.chips]);
  state.hands.splice(state.active + 1, 0, second);
  h.cards.push(draw());
  second.cards.push(draw());

  // Delte esser får kun ét kort hver
  if (h.cards[0].rank === "A") {
    h.splitAces = second.splitAces = true;
    h.done = second.done = true;
  }

  if (h.done || total(h.cards) === 21) return nextHand();
  promptForActiveHand();
  render();
}

// Afslut den aktive hånd og gå videre til næste, eller lad dealeren spille
function nextHand() {
  activeHand().done = true;
  let i = state.active + 1;
  while (i < state.hands.length) {
    const h = state.hands[i];
    if (h.done || total(h.cards) === 21) {
      h.done = true;
      i++;
    } else {
      break;
    }
  }
  if (i < state.hands.length) {
    state.active = i;
    promptForActiveHand();
    render();
  } else {
    dealerPlay();
  }
}

function dealerPlay() {
  // Dealeren trækker kun hvis mindst én hånd ikke er gået over 21.
  // Trækker til 17 og står på alle 17 (også soft 17).
  if (state.hands.some((h) => total(h.cards) <= 21)) {
    while (total(state.dealer) < 17) state.dealer.push(draw());
  }
  finishRound();
}

function settle(hand) {
  const p = total(hand.cards);
  const d = total(state.dealer);
  const pBJ = isNatural(hand);
  const dBJ = isBlackjack(state.dealer);
  const bet = hand.bet;
  const win = (payout, label, msg) => ({ payout, label, msg, cls: "win" });
  const lose = (label, msg) => ({ payout: 0, label, msg, cls: "lose" });
  const push = (msg) => ({ payout: bet, label: "Uafgjort", msg, cls: "push" });

  if (pBJ && dBJ) return push("Begge har blackjack – uafgjort.");
  if (pBJ) {
    const gain = Math.floor(bet * 1.5);
    return win(bet + gain, `Blackjack +${gain}`, `Blackjack! Du vinder ${gain} kr.`);
  }
  if (dBJ) return lose("Tabt", "Dealeren har blackjack. Du taber.");
  if (p > 21) return lose("Over 21", "Du gik over 21. Du taber.");
  if (d > 21) return win(bet * 2, `Vundet +${bet}`, `Dealeren gik over! Du vinder ${bet} kr.`);
  if (p > d) return win(bet * 2, `Vundet +${bet}`, `Du vinder ${bet} kr! (${p} mod ${d})`);
  if (p < d) return lose("Tabt", `Dealeren vinder (${d} mod ${p}).`);
  return push(`Uafgjort (${p}) – du får din indsats tilbage.`);
}

function finishRound() {
  let net = 0;
  let msg = "";

  for (const hand of state.hands) {
    const r = settle(hand);
    hand.result = r;
    hand.done = true;
    hand.winChips = toChips(Math.max(0, r.payout - hand.bet));
    state.balance += r.payout;
    net += r.payout - hand.bet;
    msg = r.msg;
  }

  if (state.hands.length > 1) {
    const d = total(state.dealer);
    const dealerText = d > 21 ? "Dealeren gik over 21." : `Dealeren har ${d}.`;
    const netText = net > 0 ? `Du vinder ${net} kr i alt.`
      : net < 0 ? `Du taber ${-net} kr i alt.`
      : "Du går lige op.";
    msg = `${dealerText} ${netText}`;
  }

  state.phase = "done";
  saveBalance();

  msg += state.balance === 0 ? " Du er løbet tør for penge." : " Placér en ny indsats.";
  setMessage(msg);
  render();
}

function resetGame() {
  state.balance = START_BALANCE;
  state.bet = 0;
  startNewBetting();
  saveBalance();
  setMessage("Placér din indsats for at starte.");
  render();
}

// ---------- Events ----------

document.querySelectorAll(".chip").forEach((chip) =>
  chip.addEventListener("click", () => addChip(Number(chip.dataset.value)))
);
el.clearBet.addEventListener("click", clearBet);
el.betSpot.addEventListener("click", removeLastChip);
el.deal.addEventListener("click", deal);
el.hit.addEventListener("click", hit);
el.stand.addEventListener("click", stand);
el.double.addEventListener("click", doubleDown);
el.split.addEventListener("click", split);
el.reset.addEventListener("click", resetGame);

document.addEventListener("keydown", (e) => {
  if (state.phase !== "playing") return;
  const key = e.key.toLowerCase();
  if (key === "h") hit();
  else if (key === "s") stand();
  else if (key === "d") doubleDown();
  else if (key === "p") split();
});

state.shoe = buildShoe();
render();
