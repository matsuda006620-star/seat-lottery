const TOTAL_SEATS = 31;
const LOTTERY_KEY = "lottery_state";
const POSITION_KEY = "seat_positions";

const resultEl = document.getElementById("result");
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

function todayString() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function loadLottery() {
  const raw = localStorage.getItem(LOTTERY_KEY);
  if (!raw) {
    return { date: todayString(), used: [], last: null };
  }

  try {
    const data = JSON.parse(raw);
    if (data.date !== todayString()) {
      return { date: todayString(), used: [], last: null };
    }
    return data;
  } catch {
    return { date: todayString(), used: [], last: null };
  }
}

function saveLottery() {
  localStorage.setItem(LOTTERY_KEY, JSON.stringify(state));
}

function loadPositions() {
  const raw = localStorage.getItem(POSITION_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePositions() {
  localStorage.setItem(POSITION_KEY, JSON.stringify(positions));
}

let state = loadLottery();
let positions = loadPositions();
let editMode = false;
let currentSeat = 1;
let animating = false;

dateTextEl.textContent = "日付: " + todayString();

function allPositionsSet() {
  for (let i = 1; i <= TOTAL_SEATS; i++) {
    if (!positions[i]) return false;
  }
  return true;
}

function remainingNumbers() {
  const result = [];
  for (let i = 1; i <= TOTAL_SEATS; i++) {
    if (!state.used.includes(i)) {
      result.push(i);
    }
  }
  return result;
}

function updateGuide() {
  if (editMode) {
    guideTextEl.textContent = `${currentSeat}番の中心をクリック`;
    return;
  }

  const count = Object.keys(positions).length;
  if (count < TOTAL_SEATS) {
    guideTextEl.textContent = `配置未完了: ${count}/${TOTAL_SEATS} 登録済み`;
    return;
  }

  guideTextEl.textContent = "";
}

function drawOverlay() {
  overlay.innerHTML = "";

  for (let i = 1; i <= TOTAL_SEATS; i++) {
    if (!positions[i]) continue;

    const marker = document.createElement("div");
    marker.className = "marker";
    marker.id = `marker-${i}`;
    marker.style.left = positions[i].x + "%";
    marker.style.top = positions[i].y + "%";

    if (state.used.includes(i)) {
      marker.classList.add("used");
    }

    overlay.appendChild(marker);

    if (editMode) {
      const label = document.createElement("div");
      label.className = "point-label";
      label.textContent = i;
      label.style.left = positions[i].x + "%";
      label.style.top = positions[i].y + "%";
      overlay.appendChild(label);
    }
  }
}

function render() {
  resultEl.textContent = state.last ?? "--";
  remainingTextEl.textContent = "残り: " + (TOTAL_SEATS - state.used.length);
  updateGuide();
  drawOverlay();

  drawBtn.disabled = animating || editMode || !allPositionsSet();
  settingsBtn.disabled = animating;
  editBtn.disabled = animating;
  clearBtn.disabled = animating;
  resetBtn.disabled = animating;
}

function openSettings() {
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
  positions = {};
  savePositions();
  settingsModal.classList.add("hidden");
  render();
}

function clearPositions() {
  if (!confirm("登録した座標を全部消しますか？")) return;
  positions = {};
  savePositions();
  render();
}

function mapClick(event) {
  if (!editMode) return;

  const rect = seatMap.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;

  positions[currentSeat] = {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2))
  };

  savePositions();

  currentSeat += 1;

  if (currentSeat > TOTAL_SEATS) {
    editMode = false;
    alert("31席の登録が完了しました");
  }

  render();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function drawLottery() {
  if (animating) return;
  if (!allPositionsSet()) {
    alert("先に設定から配置調整を行ってください");
    return;
  }

  const remain = remainingNumbers();
  if (remain.length === 0) {
    alert("本日の抽選は終了しました");
    return;
  }

  animating = true;
  render();

  const picked = remain[Math.floor(Math.random() * remain.length)];
  resultEl.textContent = picked;

  const marker = document.getElementById(`marker-${picked}`);
  if (marker) {
    marker.classList.add("blinking");
  }

  await wait(1250);

  state.used.push(picked);
  state.last = picked;
  saveLottery();

  animating = false;
  render();
}

function resetLottery() {
  if (!confirm("本日の抽選をリセットしますか？")) return;
  state = { date: todayString(), used: [], last: null };
  saveLottery();
  settingsModal.classList.add("hidden");
  render();
}

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal && !editMode) {
    closeSettings();
  }
});

mapArea.addEventListener("click", mapClick);
drawBtn.addEventListener("click", drawLottery);
resetBtn.addEventListener("click", resetLottery);
editBtn.addEventListener("click", startEditMode);
clearBtn.addEventListener("click", clearPositions);

render();