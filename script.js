import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

/* =========================
   Firebase設定
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDbjRxjquhAxUNqp_Y_kCz7I9yh9PFw0SA",
  authDomain: "seat-lottery-57fb7.firebaseapp.com",
  projectId: "seat-lottery-57fb7",
  storageBucket: "seat-lottery-57fb7.firebasestorage.app",
  messagingSenderId: "807925530514",
  appId: "1:807925530514:web:c960085409ad19a1a94b4b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const sharedDocRef = doc(db, "seatLottery", "shared");

/* =========================
   基本設定
========================= */
const TOTAL_SEATS = 31;

/*
  管理者用PIN
  好きな4桁などに変えてください
*/
const ADMIN_PIN = "1234";

/* =========================
   ローカル保存キー
========================= */
const CLIENT_ID_KEY = "seatLottery_clientId";
const MY_DRAW_KEY = "seatLottery_myDraw";

/* =========================
   DOM
========================= */
const resultEl = document.getElementById("result");
const myResultTextEl = document.getElementById("myResultText");
const drawBtn = document.getElementById("drawBtn");
const settingsBtn = document.getElementById("settingsBtn");
const resetBtn = document.getElementById("resetBtn");
const editBtn = document.getElementById("editBtn");
const clearBtn = document.getElementById("clearBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const dateTextEl = document.getElementById("dateText");
const remainingTextEl = document.getElementById("remainingText");
const guideTextEl = document.getElementById("guideText");
const mapArea = document.getElementById("mapArea");
const overlay = document.getElementById("overlay");
const seatMap = document.getElementById("seatMap");
const settingsModal = document.getElementById("settingsModal");

/* =========================
   状態
========================= */
let sharedState = {
  date: "",
  used: [],
  last: null,
  positions: {},
  drawnClients: {}
};

let editMode = false;
let currentSeat = 1;
let positionsDraft = {};
let animating = false;

/* =========================
   共通関数
========================= */
function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function createClientId() {
  return "client-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getClientId() {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = createClientId();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

function getStoredMyDraw() {
  try {
    return JSON.parse(localStorage.getItem(MY_DRAW_KEY)) || null;
  } catch {
    return null;
  }
}

function saveMyDraw(number) {
  localStorage.setItem(MY_DRAW_KEY, JSON.stringify({
    date: todayString(),
    number
  }));
}

function clearMyDraw() {
  localStorage.removeItem(MY_DRAW_KEY);
}

function getMyNumberToday() {
  const stored = getStoredMyDraw();
  if (!stored) return null;
  if (stored.date !== todayString()) {
    clearMyDraw();
    return null;
  }
  return stored.number;
}

function hasAllPositions() {
  const positions = sharedState.positions || {};
  for (let i = 1; i <= TOTAL_SEATS; i++) {
    if (!positions[i]) return false;
  }
  return true;
}

function defaultSharedState(existingPositions = {}) {
  return {
    date: todayString(),
    used: [],
    last: null,
    positions: existingPositions,
    drawnClients: {}
  };
}

function normalizeState(data) {
  if (!data) return defaultSharedState({});
  return {
    date: data.date || todayString(),
    used: Array.isArray(data.used) ? data.used : [],
    last: data.last ?? null,
    positions: data.positions || {},
    drawnClients: data.drawnClients || {}
  };
}

async function ensureTodayState() {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sharedDocRef);

    if (!snap.exists()) {
      transaction.set(sharedDocRef, defaultSharedState({}));
      return;
    }

    const data = normalizeState(snap.data());

    if (data.date !== todayString()) {
      transaction.set(sharedDocRef, defaultSharedState(data.positions));
    }
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================
   表示
========================= */
function updateGuide() {
  if (editMode) {
    guideTextEl.textContent = `${currentSeat}番の中心をクリック`;
    return;
  }

  if (!hasAllPositions()) {
    guideTextEl.textContent = "管理者がまだ座標設定を完了していません";
    return;
  }

  const myNumber = getMyNumberToday();
  if (myNumber !== null) {
    guideTextEl.textContent = "この端末は本日すでに抽選済みです";
    return;
  }

  guideTextEl.textContent = "";
}

function updateMyResultText() {
  const myNumber = getMyNumberToday();
  if (myNumber === null) {
    myResultTextEl.textContent = "この端末の本日の番号: まだ引いていません";
  } else {
    myResultTextEl.textContent = `この端末の本日の番号: ${myNumber}`;
  }
}

function renderOverlay() {
  overlay.innerHTML = "";

  const sourcePositions = editMode ? positionsDraft : (sharedState.positions || {});

  for (let i = 1; i <= TOTAL_SEATS; i++) {
    const pos = sourcePositions[i];
    if (!pos) continue;

    const marker = document.createElement("div");
    marker.className = "marker";
    marker.id = `marker-${i}`;
    marker.style.left = pos.x + "%";
    marker.style.top = pos.y + "%";

    if (!editMode && Array.isArray(sharedState.used) && sharedState.used.includes(i)) {
      marker.classList.add("used");
    }

    overlay.appendChild(marker);

    if (editMode) {
      const label = document.createElement("div");
      label.className = "point-label";
      label.textContent = i;
      label.style.left = pos.x + "%";
      label.style.top = pos.y + "%";
      overlay.appendChild(label);
    }
  }
}

function render() {
  dateTextEl.textContent = "日付: " + todayString();
  resultEl.textContent = sharedState.last ?? "--";
  remainingTextEl.textContent = "残り: " + (TOTAL_SEATS - (sharedState.used || []).length);

  updateMyResultText();
  updateGuide();
  renderOverlay();

  const myNumber = getMyNumberToday();

  drawBtn.disabled =
    animating ||
    editMode ||
    !hasAllPositions() ||
    myNumber !== null;

  settingsBtn.disabled = animating;
  editBtn.disabled = animating;
  clearBtn.disabled = animating;
  resetBtn.disabled = animating;
}

/* =========================
   共有同期
========================= */
async function subscribeSharedState() {
  await ensureTodayState();

  onSnapshot(sharedDocRef, async (snap) => {
    if (!snap.exists()) {
      await ensureTodayState();
      return;
    }

    const data = normalizeState(snap.data());

    if (data.date !== todayString()) {
      await ensureTodayState();
      return;
    }

    sharedState = data;

    const clientId = getClientId();
    const myServerNumber = sharedState.drawnClients?.[clientId];
    if (myServerNumber != null) {
      saveMyDraw(myServerNumber);
    } else {
      const local = getStoredMyDraw();
      if (local && local.date !== todayString()) {
        clearMyDraw();
      }
    }

    render();
  });
}

/* =========================
   設定
========================= */
function openSettings() {
  const pin = prompt("管理者PINを入力してください");
  if (pin === null) return;

  if (pin !== ADMIN_PIN) {
    alert("PINが違います");
    return;
  }

  settingsModal.classList.remove("hidden");
}

function closeSettings() {
  if (editMode) return;
  settingsModal.classList.add("hidden");
}

function startEditMode() {
  if (!seatMap.complete) {
    alert("画像がまだ読み込めていません");
    return;
  }

  if (!confirm("座標を最初から登録し直しますか？")) return;

  editMode = true;
  currentSeat = 1;
  positionsDraft = {};
  settingsModal.classList.add("hidden");
  render();
}

async function clearPositions() {
  if (!confirm("登録した座標を全部消しますか？")) return;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sharedDocRef);
    const data = snap.exists() ? normalizeState(snap.data()) : defaultSharedState({});
    data.positions = {};
    transaction.set(sharedDocRef, data);
  });

  alert("座標を消しました");
}

async function resetLottery() {
  if (!confirm("本日の抽選をリセットしますか？")) return;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sharedDocRef);
    const data = snap.exists() ? normalizeState(snap.data()) : defaultSharedState({});
    transaction.set(sharedDocRef, defaultSharedState(data.positions));
  });

  clearMyDraw();
  settingsModal.classList.add("hidden");
}

/* =========================
   座標登録
========================= */
async function finishEditMode() {
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(sharedDocRef);
    const data = snap.exists() ? normalizeState(snap.data()) : defaultSharedState({});
    data.positions = positionsDraft;
    transaction.set(sharedDocRef, data);
  });

  editMode = false;
  alert("31席の登録が完了しました");
}

async function handleMapClick(event) {
  if (!editMode) return;

  const rect = seatMap.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  positionsDraft[currentSeat] = {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2))
  };

  currentSeat += 1;
  render();

  if (currentSeat > TOTAL_SEATS) {
    await finishEditMode();
  }
}

/* =========================
   抽選
========================= */
async function drawLottery() {
  if (animating) return;

  if (!hasAllPositions()) {
    alert("管理者が先に座標設定を行ってください");
    return;
  }

  const clientId = getClientId();
  const localMyNumber = getMyNumberToday();
  if (localMyNumber !== null) {
    alert(`この端末は本日すでに ${localMyNumber} 番を引いています`);
    return;
  }

  try {
    animating = true;
    render();

    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(sharedDocRef);

      let data = snap.exists()
        ? normalizeState(snap.data())
        : defaultSharedState({});

      if (data.date !== todayString()) {
        data = defaultSharedState(data.positions);
      }

      if (!data.positions || Object.keys(data.positions).length < TOTAL_SEATS) {
        throw new Error("管理者が座標設定を完了していません");
      }

      if (data.drawnClients?.[clientId] != null) {
        return {
          already: true,
          number: data.drawnClients[clientId]
        };
      }

      const remaining = [];
      for (let i = 1; i <= TOTAL_SEATS; i++) {
        if (!data.used.includes(i)) remaining.push(i);
      }

      if (remaining.length === 0) {
        throw new Error("本日の抽選は終了しました");
      }

      const picked = remaining[Math.floor(Math.random() * remaining.length)];

      data.used = [...data.used, picked];
      data.last = picked;
      data.drawnClients = {
        ...data.drawnClients,
        [clientId]: picked
      };

      transaction.set(sharedDocRef, data);

      return {
        already: false,
        number: picked
      };
    });

    const picked = result.number;
    saveMyDraw(picked);
    resultEl.textContent = picked;
    updateMyResultText();

    const marker = document.getElementById(`marker-${picked}`);
    if (marker && !result.already) {
      marker.classList.add("blinking");
      await wait(1250);
    }

    if (result.already) {
      alert(`この端末は本日すでに ${picked} 番を引いています`);
    }
  } catch (error) {
    alert(error.message || "抽選に失敗しました");
  } finally {
    animating = false;
    render();
  }
}

/* =========================
   イベント
========================= */
settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal && !editMode) {
    closeSettings();
  }
});

editBtn.addEventListener("click", startEditMode);
clearBtn.addEventListener("click", clearPositions);
resetBtn.addEventListener("click", resetLottery);
drawBtn.addEventListener("click", drawLottery);
mapArea.addEventListener("click", handleMapClick);

/* =========================
   初期化
========================= */
subscribeSharedState();
render();