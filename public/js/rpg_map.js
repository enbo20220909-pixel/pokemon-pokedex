const RpgMapModule = (() => {
  const API_BASE = "http://127.0.0.1:8001/api/rpg";
  let state = null;
  let activeTab = "map";
  let animFrameId = null;

  // 擴展為大型無縫卷軸地圖：60 欄 x 40 列 (1920 x 1280 像素)
  const TILE_SIZE = 32;
  const COLS = 60;
  const ROWS = 40;
  let TILEMAP = [];

  // 生成包含「南方初始小鎮、中央木橋與河流、東西兩大高草叢野區、北方山道與道館聖殿」的精緻大型地圖
  function buildLargeWorldMap() {
    TILEMAP = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        // 外圍森林大樹邊界 (3)
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          TILEMAP[r][c] = 3;
          continue;
        }
        // 中央東西向清澈河流 (row 18~20)，留出兩座木橋通道 (col 18~20 & col 40~42)
        if (r >= 18 && r <= 20) {
          if ((c >= 18 && c <= 20) || (c >= 40 && c <= 42)) {
            TILEMAP[r][c] = 8; // 木橋地板
          } else {
            TILEMAP[r][c] = 4; // 流動水面
          }
          continue;
        }
        // 隨機自然樹木與花叢點綴
        if ((r * 7 + c * 13) % 29 === 0 && r > 3 && r < ROWS - 3) {
          TILEMAP[r][c] = 3;
        } else if ((r * 5 + c * 11) % 19 === 0) {
          TILEMAP[r][c] = 7; // 花叢
        }
      }
    }

    // 鋪設貫穿南北與東西的黃沙主幹道 (2)
    for (let r = 6; r <= 34; r++) {
      if (TILEMAP[r][19] !== 8) TILEMAP[r][19] = 2;
      if (TILEMAP[r][41] !== 8) TILEMAP[r][41] = 2;
    }
    for (let c = 8; c <= 52; c++) {
      TILEMAP[28][c] = 2;
      TILEMAP[11][c] = 2;
    }

    // 4 大高草叢野生生態區 (1)
    const grassZones = [
      [5, 16, 22, 26],   // 西南牧場草叢
      [44, 56, 22, 34],  // 東南森林草叢
      [4, 16, 4, 15],    // 西北秘境草叢
      [44, 56, 4, 15]    // 東北高地草叢
    ];
    grassZones.forEach(([c1, c2, r1, r2]) => {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          if (TILEMAP[r][c] === 0 || TILEMAP[r][c] === 7) TILEMAP[r][c] = 1;
        }
      }
    });

    // 南方小鎮：左側精靈中心 (col 11~15, row 24~26)
    for (let r = 24; r <= 26; r++) {
      for (let c = 11; c <= 15; c++) TILEMAP[r][c] = 5;
    }
    TILEMAP[26][13] = 6; // 精靈中心大門

    // 南方小鎮：右側道具屋/訓練家之家 (col 24~28, row 24~26)
    for (let r = 24; r <= 26; r++) {
      for (let c = 24; c <= 28; c++) TILEMAP[r][c] = 5;
    }
    TILEMAP[26][26] = 6; // 訓練家之家大門

    // 北方高地：島嶼道館聖殿 (col 27~33, row 4~7)
    for (let r = 4; r <= 7; r++) {
      for (let c = 27; c <= 33; c++) TILEMAP[r][c] = 5;
    }
    TILEMAP[7][30] = 6; // 道館大門
    for (let r = 8; r <= 11; r++) TILEMAP[r][30] = 2; // 連接主幹道
  }

  buildLargeWorldMap();

  let player = { x: 19.5 * TILE_SIZE, y: 28.5 * TILE_SIZE, dir: "down", step: 0, moving: false };
  let lastGrassTileKey = "";
  let grassParticles = [];
  let dialogText = null;
  let activeWildBattle = null;
  let isEncountering = false;
  let imgCache = {};
  const keys = {};

  function getSpriteImg(url) {
    if (!url) return null;
    if (!imgCache[url]) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      imgCache[url] = img;
    }
    return imgCache[url];
  }

  function init() {
    const loginGroup = document.querySelector(".trainer-login-group");
    if (loginGroup && !document.getElementById("openRpgBtn")) {
      const btn = document.createElement("button");
      btn.id = "openRpgBtn";
      btn.className = "rpg-launch-btn";
      btn.textContent = "🎮 經典掌機 RPG 冒險";
      btn.onclick = openWorld;
      loginGroup.appendChild(btn);
    }

    if (!document.getElementById("pokopiaOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "pokopiaOverlay";
      overlay.className = "pokopia-overlay";
      overlay.innerHTML = `<div class="pokopia-window" id="pokopiaContent"></div>`;
      document.body.appendChild(overlay);
    }

    window.addEventListener("keydown", e => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      const ov = document.getElementById("pokopiaOverlay");
      if (ov && ov.style.display === "flex" && ["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) {
        e.preventDefault();
      }
      if (k === " " && activeTab === "map" && !activeWildBattle) {
        if (dialogText) {
          dialogText = null;
          updateDialogUI();
        } else {
          checkDoorInteraction();
        }
      }
    });
    window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  }

  async function openWorld() {
    const trainerId = localStorage.getItem("trainer_id");
    if (!trainerId) return alert("請先在上方輸入訓練家代號！");

    const overlay = document.getElementById("pokopiaOverlay");
    const content = document.getElementById("pokopiaContent");
    overlay.style.display = "flex";
    content.innerHTML = `<p style="text-align:center; padding:60px; font-weight:800; color:#1e293b;">正在載入 16-bit 大型無縫探索地圖...</p>`;

    const res = await fetch(`${API_BASE}/state/${encodeURIComponent(trainerId)}`);
    state = await res.json();
    activeTab = "map";
    activeWildBattle = null;
    player = { x: 19.5 * TILE_SIZE, y: 28.5 * TILE_SIZE, dir: "down", step: 0, moving: false };
    dialogText = `歡迎來到【${state.current_island.name}】(推薦 Lv.${state.current_island.min_lv}~${state.current_island.max_lv})！往北過木橋可挑戰道館，四處高草叢皆可練等抓寶！`;
    render();
  }

  function closeWorld() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    document.getElementById("pokopiaOverlay").style.display = "none";
  }

  function switchTab(tab) {
    activeTab = tab;
    if (tab !== "map" && animFrameId) cancelAnimationFrame(animFrameId);
    render();
  }

  function isPassable(px, py) {
    const col = Math.floor(px / TILE_SIZE);
    const row = Math.floor(py / TILE_SIZE);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return false;
    const tile = TILEMAP[row][col];
    return tile !== 3 && tile !== 4 && tile !== 5;
  }

  function checkDoorInteraction() {
    const col = Math.floor(player.x / TILE_SIZE);
    const row = Math.floor(player.y / TILE_SIZE);
    const checkCoords = [[col, row], [col, row - 1]];
    for (const [c, r] of checkCoords) {
      if (TILEMAP[r] && TILEMAP[r][c] === 6) {
        if (r > 20 && c < 20) {
          holdPicnicAction(); // 精靈中心
        } else if (r > 20 && c >= 20) {
          dialogText = "訓練家之家：將最強的夥伴排在保管箱第一位，就能派它打頭陣獲得經驗值升級喔！";
          updateDialogUI();
        } else {
          winGymAction(); // 北方道館
        }
        return;
      }
    }
  }

  function startGbaLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const canvas = document.getElementById("pokopiaCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    function loop() {
      if (activeTab !== "map") return;
      if (!activeWildBattle && !isEncountering && !dialogText) {
        updatePlayerMovement();
      }
      drawGbaScrollWorld(ctx, canvas);
      animFrameId = requestAnimationFrame(loop);
    }
    animFrameId = requestAnimationFrame(loop);
  }

  function updatePlayerMovement() {
    const baseSpeed = 2.6;
    const speed = baseSpeed * (state?.speed_multiplier || 1.0);
    let dx = 0, dy = 0;

    if (keys["w"] || keys["arrowup"]) { dy = -1; player.dir = "up"; }
    else if (keys["s"] || keys["arrowdown"]) { dy = 1; player.dir = "down"; }
    else if (keys["a"] || keys["arrowleft"]) { dx = -1; player.dir = "left"; }
    else if (keys["d"] || keys["arrowright"]) { dx = 1; player.dir = "right"; }

    player.moving = (dx !== 0 || dy !== 0);
    if (player.moving) {
      const nextX = player.x + dx * speed;
      const nextY = player.y + dy * speed;
      if (isPassable(nextX, nextY)) {
        player.x = nextX;
        player.y = nextY;
        player.step += 0.18 * (state?.speed_multiplier || 1.0);

        const col = Math.floor(player.x / TILE_SIZE);
        const row = Math.floor(player.y / TILE_SIZE);
        const tileKey = `${col},${row}`;

        if (TILEMAP[row][col] === 1 && tileKey !== lastGrassTileKey) {
          lastGrassTileKey = tileKey;
          spawnGrassRustle(col * TILE_SIZE + 16, row * TILE_SIZE + 16);
          if (Math.random() < 0.24) {
            triggerGbaGrassEncounter();
          }
        } else if (TILEMAP[row][col] !== 1) {
          lastGrassTileKey = "";
        }
      }
    }

    for (let i = grassParticles.length - 1; i >= 0; i--) {
      grassParticles[i].life--;
      grassParticles[i].y -= 0.4;
      if (grassParticles[i].life <= 0) grassParticles.splice(i, 1);
    }
  }

  function spawnGrassRustle(x, y) {
    for (let i = 0; i < 5; i++) {
      grassParticles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 14,
        life: 18
      });
    }
  }

  async function triggerGbaGrassEncounter() {
    isEncountering = true;
    const screenWrap = document.querySelector(".gba-screen-wrap");
    if (screenWrap) {
      const flash = document.createElement("div");
      flash.className = "encounter-flash";
      screenWrap.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
    }

    const res = await fetch(`${API_BASE}/encounter/${encodeURIComponent(state.trainer_id)}/${state.current_island.id}`);
    const data = await res.json();
    setTimeout(() => {
      isEncountering = false;
      startWildBattle(data.pokemon, data.encounter_type === "legendary");
    }, 550);
  }

  // 繪製大型卷軸地圖與精緻 16-bit 像素場景細節
  function drawGbaScrollWorld(ctx, canvas) {
    const worldW = COLS * TILE_SIZE;
    const worldH = ROWS * TILE_SIZE;
    const camX = Math.max(0, Math.min(worldW - canvas.width, Math.round(player.x - canvas.width / 2)));
    const camY = Math.max(0, Math.min(worldH - canvas.height, Math.round(player.y - canvas.height / 2)));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camX, -camY);

    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE));
    const endCol = Math.min(COLS - 1, Math.ceil((camX + canvas.width) / TILE_SIZE));
    const startRow = Math.max(0, Math.floor(camY / TILE_SIZE));
    const endRow = Math.min(ROWS - 1, Math.ceil((camY + canvas.height) / TILE_SIZE));

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const t = TILEMAP[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        // 精緻雙色草地磚＋小草點細節
        ctx.fillStyle = (r + c) % 2 === 0 ? "#88d860" : "#80d058";
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        if ((r * 3 + c) % 7 === 0) {
          ctx.fillStyle = "#68b848";
          ctx.fillRect(x + 8, y + 12, 3, 4);
          ctx.fillRect(x + 12, y + 14, 3, 3);
        }

        if (t === 1) {
          // 精緻多層次深綠高草叢
          ctx.fillStyle = "#2d862d";
          ctx.fillRect(x + 2, y + 8, 28, 22);
          ctx.fillStyle = "#48b048";
          ctx.fillRect(x + 4, y + 4, 6, 14);
          ctx.fillRect(x + 13, y + 2, 6, 16);
          ctx.fillRect(x + 22, y + 5, 6, 13);
          ctx.fillStyle = "#78d868";
          ctx.fillRect(x + 5, y + 4, 2, 6);
          ctx.fillRect(x + 14, y + 2, 2, 6);
        } else if (t === 2) {
          // 黃沙泥土小徑＋碎石點綴
          ctx.fillStyle = "#f0d898";
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#d8b868";
          ctx.fillRect(x + 5, y + 7, 4, 3);
          ctx.fillRect(x + 21, y + 20, 4, 3);
        } else if (t === 3) {
          // 精緻雙層樹冠像素大樹
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(x + 4, y + 26, 24, 6);
          ctx.fillStyle = "#784820";
          ctx.fillRect(x + 11, y + 20, 10, 12);
          ctx.fillStyle = "#1b5e20";
          ctx.fillRect(x + 3, y + 4, 26, 20);
          ctx.fillStyle = "#388e3c";
          ctx.fillRect(x + 5, y + 2, 22, 16);
          ctx.fillStyle = "#66bb6a";
          ctx.fillRect(x + 8, y + 4, 12, 8);
        } else if (t === 4) {
          // 流動蔚藍水面
          ctx.fillStyle = "#3b9eff";
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#bae6fd";
          const shift = Math.floor(Date.now() / 350 + r) % 2 === 0 ? 4 : 12;
          ctx.fillRect(x + shift, y + 12, 12, 3);
        } else if (t === 8) {
          // 跨河原木木橋＋上下欄杆
          ctx.fillStyle = "#b45309";
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = "#d97706";
          ctx.fillRect(x + 2, y + 2, 28, 28);
          ctx.fillStyle = "#78350f";
          ctx.fillRect(x, y + 10, TILE_SIZE, 2);
          ctx.fillRect(x, y + 22, TILE_SIZE, 2);
        } else if (t === 5 || t === 6) {
          ctx.fillStyle = "#fef9c3";
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = "#94a3b8";
          ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          if (t === 6) {
            ctx.fillStyle = "#334155";
            ctx.fillRect(x + 6, y + 4, 20, 28);
            ctx.fillStyle = "#facc15";
            ctx.fillRect(x + 21, y + 18, 3, 3);
          }
        } else if (t === 7) {
          // 紅黃雙色小花叢
          ctx.fillStyle = "#16a34a";
          ctx.fillRect(x + 6, y + 12, 20, 12);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(x + 7, y + 9, 6, 6);
          ctx.fillStyle = "#facc15";
          ctx.fillRect(x + 19, y + 11, 6, 6);
        }
      }
    }

    // 繪製三座精緻像素屋頂建築
    drawPixelBuildingRoof(ctx, 11, 24, 5, "#dc2626", "POKÉ CENTER");
    drawPixelBuildingRoof(ctx, 24, 24, 5, "#0284c7", "TRAINER HOUSE");
    drawPixelBuildingRoof(ctx, 27, 4, 7, "#7c3aed", `GYM・${state.current_island.gym_leader}`);

    ctx.fillStyle = "#15803d";
    for (const gp of grassParticles) ctx.fillRect(gp.x, gp.y, 4, 4);

    drawGbaPixelTrainer(ctx);
    ctx.restore();

    // 右上角半透明迷你雷達小地圖
    drawMiniRadar(ctx, canvas);
  }

  function drawPixelBuildingRoof(ctx, startCol, startRow, spanCols, color, label) {
    const x = startCol * TILE_SIZE - 4;
    const y = startRow * TILE_SIZE - 8;
    const w = spanCols * TILE_SIZE + 8;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 46);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x + 4, y + 4, w - 8, 10);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, 46);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + 28);
  }

  function drawMiniRadar(ctx, canvas) {
    const rw = 120, rh = 80;
    const rx = canvas.width - rw - 14;
    const ry = 14;
    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    // 河流線
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(rx + 2, ry + rh * 0.46, rw - 4, 5);
    // 道館位置紅點
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(rx + (30 / COLS) * rw - 3, ry + (5 / ROWS) * rh - 3, 6, 6);
    // 玩家閃爍白點
    const px = rx + (player.x / (COLS * TILE_SIZE)) * rw;
    const py = ry + (player.y / (ROWS * TILE_SIZE)) * rh;
    ctx.fillStyle = "#facc15";
    ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawGbaPixelTrainer(ctx) {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const swing = player.moving ? Math.sin(player.step) * 3 : 0;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(px - 9, py + 11, 18, 5);

    if (state?.mounted) {
      const mImg = getSpriteImg(state.mounted.sprite);
      if (mImg && mImg.complete && mImg.naturalWidth > 0) {
        ctx.drawImage(mImg, px - 24, py - 22 + swing * 0.5, 48, 48);
      }
    }

    const oy = state?.mounted ? -14 : 0;
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(px - 6, py + 4 + oy + swing, 5, 8);
    ctx.fillRect(px + 1, py + 4 + oy - swing, 5, 8);
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(px - 8, py - 6 + oy, 16, 11);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px - 2, py - 6 + oy, 4, 11);
    ctx.fillStyle = "#fed7aa";
    ctx.fillRect(px - 7, py - 16 + oy, 14, 10);
    ctx.fillStyle = "#0f172a";
    if (player.dir !== "up") {
      ctx.fillRect(px - 4, py - 12 + oy, 2, 3);
      ctx.fillRect(px + 2, py - 12 + oy, 2, 3);
    }
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(px - 8, py - 21 + oy, 16, 6);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(px - 3, py - 19 + oy, 6, 3);
  }

  function updateDialogUI() {
    const slot = document.getElementById("gbaDialogSlot");
    if (!slot) return;
    slot.innerHTML = dialogText
      ? `<div class="gba-dialog-box"><span>▶ ${dialogText}</span><button class="cozy-btn" onclick="RpgMapModule.dismissDialog()">繼續 [Space]</button></div>`
      : "";
  }

  function dismissDialog() {
    dialogText = null;
    updateDialogUI();
  }

  // ================= 經典掌機遭遇戰鬥與等級經驗系統 =================
  function startWildBattle(wildMon, isLegendary) {
    const leadMon = state.pc_box[0];
    const wildLv = wildMon.level || 5;
    const wildMaxHp = 95 + wildLv * 12;
    const playerMaxHp = leadMon.max_hp || (110 + (leadMon.level || 5) * 14);

    activeWildBattle = {
      wildMon,
      wildLv,
      isLegendary,
      wildHp: wildMaxHp,
      wildMaxHp,
      playerMon: leadMon,
      playerHp: playerMaxHp,
      playerMaxHp,
      logs: [`野生的「${wildMon.name} (Lv.${wildLv})」跳出來了！削弱體力後投擲精靈球吧！`],
      finished: false
    };
    renderWildBattleOverlay();
  }

  function renderWildBattleOverlay() {
    const slot = document.getElementById("wildBattleSlot");
    if (!slot || !activeWildBattle) return;
    const b = activeWildBattle;
    const wPct = Math.max(0, Math.round((b.wildHp / b.wildMaxHp) * 100));
    const pPct = Math.max(0, Math.round((b.playerHp / b.playerMaxHp) * 100));
    const hpBonus = Math.round((1 - b.wildHp / b.wildMaxHp) * 45);
    const pMon = state.pc_box.find(m => m.box_id === b.playerMon.box_id) || b.playerMon;
    const expPct = Math.min(100, Math.round(((pMon.exp || 0) / (pMon.next_exp || 100)) * 100));

    slot.innerHTML = `
      <div class="gba-battle-screen">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:900; font-size:15px; color:#0f172a;">
            ${b.isLegendary ? '✨【傳說神獸降臨！】' : '🌿 野生寶可夢遭遇戰'}
          </span>
          <button class="cozy-btn" onclick="RpgMapModule.endWildBattle()">🏃 逃跑</button>
        </div>

        <div class="gba-battle-field">
          <!-- 右上角：敵方狀態框緊貼敵方寶可夢正左側 -->
          <div class="gba-enemy-cluster">
            <div class="gba-status-card">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:900; font-size:14px;">
                <span>${b.wildMon.name}</span>
                <span style="color:#b45309; font-size:12px;">Lv.${b.wildLv}</span>
              </div>
              <div class="gba-hp-track"><div class="gba-hp-bar" style="width:${wPct}%; background:${wPct > 50 ? '#22c55e' : (wPct > 20 ? '#eab308' : '#ef4444')};"></div></div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569;">
                <span>HP: ${b.wildHp}/${b.wildMaxHp}</span>
                <span style="color:#d97706; font-weight:800;">捕獲加成 +${hpBonus}%</span>
              </div>
            </div>

            <div class="gba-sprite-stage">
              <div class="gba-oval-base"></div>
              <img src="${b.wildMon.sprite}" style="width:118px; height:118px; object-fit:contain; position:relative; z-index:1; image-rendering:pixelated;">
            </div>
          </div>

          <!-- 左下角：我方狀態框緊貼我方寶可夢正右側 -->
          <div class="gba-player-cluster">
            <div class="gba-sprite-stage">
              <div class="gba-oval-base"></div>
              <img src="${pMon.sprite}" style="width:128px; height:128px; object-fit:contain; position:relative; z-index:1; image-rendering:pixelated;">
            </div>

            <div class="gba-status-card">
              <div style="display:flex; justify-content:space-between; align-items:center; font-weight:900; font-size:14px; color:#0284c7;">
                <span>${pMon.name}</span>
                <span style="font-size:12px; color:#0f172a;">Lv.${pMon.level}</span>
              </div>
              <div class="gba-hp-track"><div class="gba-hp-bar" style="width:${pPct}%;"></div></div>
              <div style="display:flex; justify-content:space-between; font-size:11px; color:#475569;">
                <span>HP: ${b.playerHp}/${b.playerMaxHp}</span>
                <span>EXP: ${pMon.exp}/${pMon.next_exp}</span>
              </div>
              <div class="gba-exp-track"><div class="gba-exp-bar" style="width:${expPct}%;"></div></div>
            </div>
          </div>
        </div>

        <div style="background:#fff; border:3px solid #1e293b; border-radius:6px; padding:6px 12px; height:52px; overflow-y:auto; font-size:12px; font-weight:700; margin-bottom:8px;">
          ${b.logs.map(l => `<div>▶ ${l}</div>`).join("")}
        </div>

        <div class="gba-command-panel">
          <div>
            <div style="font-size:11px; font-weight:900; margin-bottom:4px;">⚔️ 攻擊（擊倒或捕獲皆獲經驗）：</div>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:5px;">
              ${pMon.moves.map((m, i) => `
                <button class="cozy-btn" style="font-size:11px; padding:5px;" onclick="RpgMapModule.wildAttack(${i})">
                  ${m.name} (威${m.power})
                </button>
              `).join("")}
            </div>
          </div>

          <div>
            <div style="font-size:11px; font-weight:900; color:#15803d; margin-bottom:4px;">🔴 投擲無限精靈球捕獲：</div>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:5px;">
              ${state.bag.filter(i => i.category === "ball").map(ball => `
                <button class="cozy-btn active" style="font-size:11px; padding:5px;" onclick="RpgMapModule.wildThrowBall(${ball.catch_rate}, '${ball.name}')">
                  ${ball.name} (∞)
                </button>
              `).join("")}
            </div>
          </div>

          <div>
            <div style="font-size:11px; font-weight:900; color:#0284c7; margin-bottom:4px;">💊 無限恢復道具：</div>
            <button class="cozy-btn" style="width:100%; font-size:11px; margin-bottom:5px;" onclick="RpgMapModule.wildHeal()">🧪 全滿傷藥 (∞)</button>
            <button class="cozy-btn" style="width:100%; font-size:11px;" onclick="RpgMapModule.wildHeal()">💎 活力塊 (∞)</button>
          </div>
        </div>
      </div>
    `;
  }

  async function rewardBattleExp() {
    const b = activeWildBattle;
    const res = await fetch(`${API_BASE}/exp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trainer_id: state.trainer_id,
        box_id: b.playerMon.box_id,
        enemy_level: b.wildLv,
        is_legendary: b.isLegendary
      })
    });
    const expData = await res.json();
    state = expData.state;
    b.logs.push(`✨ ${b.playerMon.name} 獲得了 ${expData.gained_exp} 點經驗值！`);
    if (expData.leveled_up) {
      b.logs.push(`🆙 恭喜升級！【${b.playerMon.name}】升到了 Lv.${expData.new_level}！`);
    }
  }

  async function wildAttack(moveIdx) {
    const b = activeWildBattle;
    if (!b || b.finished) return;
    const pMon = state.pc_box.find(m => m.box_id === b.playerMon.box_id) || b.playerMon;
    const mv = pMon.moves[moveIdx] || { name: "撞擊", power: 40 };
    const levelBonus = 1 + (pMon.level || 5) * 0.04;
    const dmg = Math.max(15, Math.round((mv.power || 50) * 0.45 * levelBonus));

    b.wildHp = Math.max(0, b.wildHp - dmg);
    b.logs.push(`${pMon.name} 使出「${mv.name}」，造成 ${dmg} 點傷害！`);

    if (b.wildHp <= 0) {
      b.finished = true;
      b.logs.push(`💥 野生的 ${b.wildMon.name} (Lv.${b.wildLv}) 倒下了！`);
      await rewardBattleExp();
      renderWildBattleOverlay();
      setTimeout(() => { endWildBattle(); render(); }, 1500);
      return;
    }

    const enemyDmg = Math.max(8, Math.round((10 + b.wildLv * 1.4) * (0.85 + Math.random() * 0.3)));
    b.playerHp = Math.max(10, b.playerHp - enemyDmg);
    b.logs.push(`野生 ${b.wildMon.name} 反擊造成 ${enemyDmg} 點傷害！`);
    renderWildBattleOverlay();
  }

  function wildHeal() {
    const b = activeWildBattle;
    if (!b) return;
    b.playerHp = b.playerMaxHp;
    b.logs.push(`使用無限恢復道具，${b.playerMon.name} 體力完全恢復！`);
    renderWildBattleOverlay();
  }

  async function wildThrowBall(baseRate, ballName) {
    const b = activeWildBattle;
    if (!b || b.finished) return;
    const hpBonus = (1 - b.wildHp / b.wildMaxHp) * 0.45;
    const finalRate = Math.min(1.0, baseRate * 0.7 + hpBonus);

    if (Math.random() <= finalRate) {
      b.finished = true;
      const res = await fetch(`${API_BASE}/catch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: state.trainer_id, pokemon: b.wildMon })
      });
      const data = await res.json();
      state = data.state;
      b.logs.push(`🎉 叮咚！使用「${ballName}」成功收服了【${b.wildMon.name} (Lv.${b.wildLv})】！`);
      await rewardBattleExp();
      renderWildBattleOverlay();
      setTimeout(() => { endWildBattle(); render(); }, 1600);
    } else {
      b.logs.push(`💦 差一點！${b.wildMon.name} 掙脫了 ${ballName}，再削弱血量或換高級球試試！`);
      renderWildBattleOverlay();
    }
  }

  function endWildBattle() {
    activeWildBattle = null;
    const slot = document.getElementById("wildBattleSlot");
    if (slot) slot.innerHTML = "";
  }

  async function holdPicnicAction() {
    const res = await fetch(`${API_BASE}/picnic/${encodeURIComponent(state.trainer_id)}`, { method: "POST" });
    state = await res.json();
    dialogText = `精靈中心恢復完畢！全隊夥伴體力與心情值皆已大幅提升（累計恢復 ${state.picnic_count} 次）。`;
    updateDialogUI();
  }

  async function winGymAction() {
    const isl = state.current_island;
    const res = await fetch(`${API_BASE}/badge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainer_id: state.trainer_id, badge_name: isl.gym_badge })
    });
    state = await res.json();
    dialogText = `道館館主「${isl.gym_leader}」認可了你的實力！成功贏得【${isl.gym_badge}】！`;
    render();
  }

  async function toggleMount(boxId) {
    try {
      const res = await fetch(`${API_BASE}/mount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: state.trainer_id, box_id: boxId })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.detail);
      state = data;
      if (state.mounted) getSpriteImg(state.mounted.sprite);
      render();
    } catch (e) {}
  }

  async function travelTo(islandId) {
    try {
      const res = await fetch(`${API_BASE}/travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: state.trainer_id, island_id: islandId })
      });
      const data = await res.json();
      if (!res.ok) return alert(data.detail);
      state = data;
      activeTab = "map";
      player = { x: 19.5 * TILE_SIZE, y: 28.5 * TILE_SIZE, dir: "down", step: 0, moving: false };
      dialogText = `搭乘飛行夥伴抵達【${state.current_island.name}】(野生 Lv.${state.current_island.min_lv}~${state.current_island.max_lv})！`;
      render();
    } catch (e) {}
  }

  async function useTm(moveObj) {
    const boxId = parseInt(document.getElementById("tmTargetSelect").value);
    if (!boxId) return;
    const res = await fetch(`${API_BASE}/teach-tm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trainer_id: state.trainer_id, box_id: boxId, move: moveObj })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.detail);
    state = data;
    alert(`已成功教導「${moveObj.name}」！`);
    render();
  }

  function render() {
    const content = document.getElementById("pokopiaContent");
    if (!state || !content) return;
    const isl = state.current_island;

    let bodyHtml = "";
    if (activeTab === "map") {
      bodyHtml = `
        <div class="gba-screen-wrap">
          <canvas id="pokopiaCanvas" width="960" height="540"></canvas>
          <div id="gbaDialogSlot"></div>
          <div id="wildBattleSlot"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:12px; font-weight:800; color:#334155; flex-wrap:wrap; gap:8px;">
          <span>📍 ${isl.name} (Lv.${isl.min_lv}~${isl.max_lv}) ｜ 🏅 徽章：${state.badges.length}/5</span>
          <span>WASD 探索大型地圖（可過木橋北上道館），門口按 [空白鍵] 互動</span>
          <span>
            ${state.mounted
              ? `🐾 座騎：${state.mounted.name} (速度 ${state.speed_multiplier}x) <button class="cozy-btn" style="padding:2px 6px;" onclick="RpgMapModule.toggleMount(null)">下馬</button>`
              : `🚶 步行中 (1.0x)`}
          </span>
        </div>
      `;
    } else if (activeTab === "pc") {
      bodyHtml = `
        <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:900; font-size:15px;">📦 無上限訓練家保管箱（共收服 ${state.total_caught} 隻｜第一位為出戰先鋒）</span>
          <span style="font-size:12px; color:#16a34a; font-weight:700;">🐾 四足型態可騎乘（速度種族值越高跑越快）</span>
        </div>
        <div class="pc-box-grid">
          ${state.pc_box.map((m, idx) => `
            <div class="pc-mon-card ${m.is_legendary ? 'legendary' : ''}">
              <div style="display:flex; justify-content:space-between; font-size:10px; font-weight:900; color:#0284c7;">
                <span>${idx === 0 ? '⭐ 出戰先鋒' : `#${idx + 1}`}</span>
                <span style="color:#b45309;">Lv.${m.level}</span>
              </div>
              ${m.is_legendary ? '<div style="font-size:10px; font-weight:900; color:#d97706;">✨ 傳說神獸</div>' : ''}
              <img src="${m.sprite}" style="width:64px; height:64px; object-fit:contain; image-rendering:pixelated;">
              <div style="font-weight:900; font-size:13px;">${m.name}</div>
              <div style="font-size:10px; color:#475569;">EXP: ${m.exp}/${m.next_exp} ｜ 速度: ${m.speed}</div>
              <div style="font-size:10px; color:#0284c7; margin:4px 0;">${m.moves.map(mv => mv.name).join(" / ")}</div>
              ${m.is_quadruped
                ? `<button class="cozy-btn active" style="font-size:11px; padding:4px 8px; width:100%; margin-top:4px;" onclick="RpgMapModule.toggleMount(${m.box_id}); RpgMapModule.switchTab('map');">🐾 騎乘出遊</button>`
                : `<div style="font-size:10px; color:#94a3b8; margin-top:6px;">非四足型態</div>`}
            </div>
          `).join("")}
        </div>
      `;
    } else if (activeTab === "bag") {
      bodyHtml = `
        <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span style="font-weight:900; font-size:15px;">🎒 無限探險背包（精靈球、傷藥、活力塊、技能機全部無限量）</span>
          <div>
            <span style="font-size:12px; font-weight:700;">學習技能對象：</span>
            <select id="tmTargetSelect" style="padding:4px 8px; border-radius:6px; border:2px solid #475569;">
              ${state.pc_box.map(m => `<option value="${m.box_id}">${m.name} (Lv.${m.level})</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="pc-box-grid">
          ${state.bag.map(item => `
            <div class="pc-mon-card" style="text-align:left;">
              <div style="display:flex; justify-content:space-between; font-weight:900; font-size:13px;">
                <span>${item.name}</span>
                <span style="color:#16a34a;">x ∞</span>
              </div>
              <div style="font-size:11px; color:#475569; margin:6px 0;">${item.desc}</div>
              ${item.category === "tm"
                ? `<button class="cozy-btn active" style="font-size:11px; padding:4px 8px; width:100%;" onclick='RpgMapModule.useTm(${JSON.stringify(item.move)})'>💿 教導此技能</button>`
                : `<span style="font-size:10px; color:#64748b;">戰鬥與探索時無限自動供應</span>`}
            </div>
          `).join("")}
        </div>
      `;
    } else if (activeTab === "travel") {
      bodyHtml = `
        <div style="margin-bottom:10px;">
          <div style="font-weight:900; font-size:15px;">🕊️ 秘傳飛行・跨地區航線圖（不同地區野生等級與經驗值不同）</div>
          <div style="font-size:12px; color:${state.has_flyer ? '#16a34a' : '#dc2626'}; font-weight:700; margin-top:4px;">
            ${state.has_flyer
              ? "✓ 你的保管箱中已有【飛行屬性】夥伴，可自由飛往高難度地區練等抓神獸！"
              : "⚠️ 尚未擁有【飛行屬性】夥伴！請先在草叢捕捉波波、比比鳥等飛行系寶可夢以解鎖跨區飛行。"}
          </div>
        </div>
        <div class="pc-box-grid" style="grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));">
          ${state.islands.map(island => `
            <div class="pc-mon-card" style="text-align:left;">
              <div style="display:flex; justify-content:space-between; font-weight:900; font-size:15px; color:#0f172a;">
                <span>${island.name}</span>
                <span style="font-size:12px; color:#b45309;">Lv.${island.min_lv}~${island.max_lv}</span>
              </div>
              <div style="font-size:11px; color:#475569; margin:6px 0;">${island.desc}</div>
              <div style="font-size:11px; font-weight:700; color:#64748b; margin-bottom:8px;">道館館主：${island.gym_leader} (${island.gym_badge})</div>
              <button class="cozy-btn ${state.current_island.id === island.id ? '' : 'active'}" style="width:100%;"
                onclick="RpgMapModule.travelTo('${island.id}')">
                ${state.current_island.id === island.id ? '📍 目前所在地區' : (island.require_fly ? '🕊️ 搭乘飛行夥伴前往' : '🚶 前往此地區')}
              </button>
            </div>
          `).join("")}
        </div>
      `;
    }

    content.innerHTML = `
      <div class="pokopia-header">
        <div>
          <span style="font-size:17px; font-weight:900; color:#0f172a;">🎮 寶可夢經典掌機 RPG 冒險</span>
          <span style="font-size:12px; color:#475569; margin-left:8px;">訓練家：<b>${state.trainer_id}</b></span>
        </div>
        <div class="pokopia-nav">
          <button class="cozy-btn ${activeTab === 'map' ? 'active' : ''}" onclick="RpgMapModule.switchTab('map')">🗺️ 城鎮地圖</button>
          <button class="cozy-btn ${activeTab === 'travel' ? 'active' : ''}" onclick="RpgMapModule.switchTab('travel')">🕊️ 飛行跨區</button>
          <button class="cozy-btn ${activeTab === 'pc' ? 'active' : ''}" onclick="RpgMapModule.switchTab('pc')">📦 保管箱 (${state.total_caught})</button>
          <button class="cozy-btn ${activeTab === 'bag' ? 'active' : ''}" onclick="RpgMapModule.switchTab('bag')">🎒 無限背包</button>
          <button onclick="RpgMapModule.closeWorld()" style="background:none; border:none; font-size:22px; color:#0f172a; cursor:pointer; margin-left:6px;">&times;</button>
        </div>
      </div>
      ${bodyHtml}
    `;

    if (activeTab === "map") {
      if (state.mounted) getSpriteImg(state.mounted.sprite);
      updateDialogUI();
      startGbaLoop();
    }
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(init, 500));
  return { openWorld, closeWorld, switchTab, dismissDialog, wildAttack, wildHeal, wildThrowBall, endWildBattle, toggleMount, travelTo, useTm };
})();
