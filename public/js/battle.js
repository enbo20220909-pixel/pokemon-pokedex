const BattleModule = (() => {
  const API_BASE = "http://127.0.0.1:8001/api";
  const TYPE_ZH = {
    normal: "一般", fire: "火", water: "水", grass: "草", electric: "電",
    ice: "冰", fighting: "格鬥", poison: "毒", ground: "地面", flying: "飛行",
    psychic: "超能力", bug: "蟲", rock: "岩石", ghost: "幽靈", dragon: "龍",
    steel: "鋼", dark: "惡", fairy: "妖精"
  };

  let currentBattleId = null;
  let isBusy = false;
  let switchCooldown = 0;
  let cdTimer = null;

  function init() {
    const loginGroup = document.querySelector(".trainer-login-group");
    if (loginGroup && !document.getElementById("startBattleBtn")) {
      const btn = document.createElement("button");
      btn.id = "startBattleBtn";
      btn.className = "battle-launch-btn";
      btn.textContent = "⚔️ 開始模擬對戰";
      btn.onclick = startMatch;
      loginGroup.appendChild(btn);
    }

    if (!document.getElementById("battleArenaModal")) {
      const overlay = document.createElement("div");
      overlay.id = "battleArenaModal";
      overlay.className = "arena-overlay";
      overlay.innerHTML = `<div class="arena-box" id="arenaContent"></div>`;
      document.body.appendChild(overlay);
    }
  }

  function getHpColor(pct) {
    if (pct > 50) return "#4ade80";
    if (pct > 20) return "#facc15";
    return "#ef4444";
  }

  function spawnFloatingDmg(platformId, dmg) {
    if (!dmg || dmg <= 0) return;
    const target = document.getElementById(platformId);
    if (!target) return;
    const tag = document.createElement("div");
    tag.className = "floating-dmg";
    tag.textContent = `-${dmg}`;
    target.appendChild(tag);
    setTimeout(() => tag.remove(), 900);
  }

  function startCooldown() {
    switchCooldown = 5;
    if (cdTimer) clearInterval(cdTimer);
    cdTimer = setInterval(() => {
      switchCooldown--;
      const cdLabel = document.getElementById("switchCdLabel");
      if (switchCooldown <= 0) {
        switchCooldown = 0;
        clearInterval(cdTimer);
        if (cdLabel) cdLabel.textContent = "自由換人（就緒）";
        document.querySelectorAll(".switch-chip[data-can-switch='true']").forEach(b => b.disabled = false);
      } else {
        if (cdLabel) cdLabel.textContent = `換人冷卻中 (${switchCooldown}s)`;
      }
    }, 1000);
  }

  async function startMatch() {
    const trainerId = localStorage.getItem("trainer_id");
    if (!trainerId) return alert("請先在上方輸入訓練家代號並載入隊伍！");

    const overlay = document.getElementById("battleArenaModal");
    const content = document.getElementById("arenaContent");
    overlay.style.display = "flex";
    content.innerHTML = `<p style="text-align:center; padding:60px; color:#38bdf8; font-weight:700;">正在匹配對手並載入競技場...</p>`;

    try {
      const res = await fetch(`${API_BASE}/battle/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: trainerId })
      });
      const data = await res.json();
      if (!res.ok) {
        overlay.style.display = "none";
        return alert(data.detail || "無法開始對戰");
      }
      currentBattleId = data.battle_id;
      switchCooldown = 0;
      renderArena(data);
    } catch (err) {
      overlay.style.display = "none";
      alert("對戰伺服器連線失敗");
    }
  }

  function renderArena(state) {
    const content = document.getElementById("arenaContent");
    const p = state.player;
    const e = state.enemy;
    const pPct = Math.max(0, Math.round((p.hp / p.max_hp) * 100));
    const ePct = Math.max(0, Math.round((e.hp / e.max_hp) * 100));

    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:800; color:#38bdf8; font-size:15px;">⚔️ 6v6 模擬競技場</span>
        <button onclick="BattleModule.closeArena()" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer; line-height:1;">&times;</button>
      </div>

      <div class="battle-stage-diagonal">
        <div class="enemy-zone">
          <div class="hud-box">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:800; font-size:15px; color:#f8fafc;">${e.name}</span>
              <span style="font-size:11px; color:#f87171; font-weight:700;">剩餘 ${e.alive_count}/${e.total_count}</span>
            </div>
            <div class="hp-bar-wrap">
              <div id="enemyHpFill" class="hp-bar-fill" style="width:${ePct}%; background:${getHpColor(ePct)};"></div>
            </div>
            <div id="enemyHpText" style="font-size:11px; color:#94a3b8; display:flex; justify-content:space-between;">
              <span>HP: ${e.hp} / ${e.max_hp}</span>
              <span>速度: ${e.spe}</span>
            </div>
          </div>
          <div class="platform-oval" id="enemyPlatform">
            <img id="enemySprite" class="sprite-enemy" src="${e.sprite}">
          </div>
        </div>

        <div class="player-zone">
          <div class="platform-oval" id="playerPlatform">
            <img id="playerSprite" class="sprite-player" src="${p.sprite}">
          </div>
          <div class="hud-box">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:800; font-size:15px; color:#38bdf8;">${p.name}</span>
              <span style="font-size:11px; color:#4ade80; font-weight:700;">剩餘 ${p.alive_count}/${p.total_count}</span>
            </div>
            <div class="hp-bar-wrap">
              <div id="playerHpFill" class="hp-bar-fill" style="width:${pPct}%; background:${getHpColor(pPct)};"></div>
            </div>
            <div id="playerHpText" style="font-size:11px; color:#94a3b8; display:flex; justify-content:space-between;">
              <span>HP: ${p.hp} / ${p.max_hp}</span>
              <span>速度: ${p.spe}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="battle-log-compact" id="battleLogBox">
        ${state.logs.map(l => `<div>${l}</div>`).join("")}
      </div>

      <div id="battleControls">
        ${state.finished ? `
          <button class="battle-launch-btn" style="width:100%; padding:12px;" onclick='BattleModule.showReport(${JSON.stringify(state.analytics).replace(/'/g, "&apos;")})'>
            📊 查看賽後傷害數據與隊伍調整分析報告
          </button>
        ` : `
          <div class="control-deck">
            <div class="moves-action-grid">
              ${p.moves.map((m, idx) => `
                <button class="move-action-btn" onclick="BattleModule.useMove(${idx})" ${isBusy ? "disabled" : ""}>
                  <div style="display:flex; justify-content:space-between; font-weight:800; font-size:13px;">
                    <span>${m.name}</span>
                    <span class="type-tag type-${m.type}" style="padding:1px 6px; font-size:10px;">${TYPE_ZH[m.type] || m.type}</span>
                  </div>
                  <div style="font-size:11px; color:#94a3b8; margin-top:3px;">威力 ${m.power} ｜ 命中 ${m.accuracy}%</div>
                </button>
              `).join("")}
            </div>

            <div class="switch-panel-compact">
              <div id="switchCdLabel" style="font-size:11px; font-weight:700; color:#38bdf8;">
                ${switchCooldown > 0 ? `換人冷卻中 (${switchCooldown}s)` : "自由換人（就緒）"}
              </div>
              <div class="switch-list">
                ${(state.player_party || []).map(member => {
                  const canSwitch = !member.active && member.hp > 0;
                  return `
                    <button class="switch-chip ${member.active ? 'active' : ''}"
                      data-can-switch="${canSwitch}"
                      ${(!canSwitch || switchCooldown > 0 || isBusy) ? "disabled" : ""}
                      onclick="BattleModule.switchPokemon(${member.idx})">
                      <span style="display:flex; align-items:center; gap:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <img src="${member.sprite}" style="width:20px; height:20px;">
                        ${member.name}
                      </span>
                      <span style="font-size:10px; color:${member.hp > 0 ? '#4ade80' : '#ef4444'};">${member.hp > 0 ? member.hp : '倒下'}</span>
                    </button>
                  `;
                }).join("")}
              </div>
            </div>
          </div>
        `}
      </div>
    `;

    const logBox = document.getElementById("battleLogBox");
    if (logBox) logBox.scrollTop = logBox.scrollHeight;
  }

  function playSingleEvent(ev) {
    return new Promise(resolve => {
      const pSprite = document.getElementById("playerSprite");
      const eSprite = document.getElementById("enemySprite");
      const logBox = document.getElementById("battleLogBox");

      if (logBox) {
        const line = document.createElement("div");
        line.textContent = ev.log;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
      }

      if (ev.attacker === "player") {
        if (pSprite) {
          pSprite.classList.remove("anim-diagonal-player-atk");
          void pSprite.offsetWidth;
          pSprite.classList.add("anim-diagonal-player-atk");
        }
        setTimeout(() => {
          if (ev.damage > 0 && eSprite) {
            eSprite.classList.remove("anim-hit-shake");
            void eSprite.offsetWidth;
            eSprite.classList.add("anim-hit-shake");
            spawnFloatingDmg("enemyPlatform", ev.damage);
          }
          const pct = Math.max(0, Math.round((ev.target_hp_after / ev.target_max_hp) * 100));
          const fill = document.getElementById("enemyHpFill");
          const txt = document.getElementById("enemyHpText");
          if (fill) { fill.style.width = `${pct}%`; fill.style.background = getHpColor(pct); }
          if (txt) txt.firstElementChild.textContent = `HP: ${ev.target_hp_after} / ${ev.target_max_hp}`;
        }, 200);
      } else {
        if (eSprite) {
          eSprite.classList.remove("anim-diagonal-enemy-atk");
          void eSprite.offsetWidth;
          eSprite.classList.add("anim-diagonal-enemy-atk");
        }
        setTimeout(() => {
          if (ev.damage > 0 && pSprite) {
            pSprite.classList.remove("anim-hit-shake");
            void pSprite.offsetWidth;
            pSprite.classList.add("anim-hit-shake");
            spawnFloatingDmg("playerPlatform", ev.damage);
          }
          const pct = Math.max(0, Math.round((ev.target_hp_after / ev.target_max_hp) * 100));
          const fill = document.getElementById("playerHpFill");
          const txt = document.getElementById("playerHpText");
          if (fill) { fill.style.width = `${pct}%`; fill.style.background = getHpColor(pct); }
          if (txt) txt.firstElementChild.textContent = `HP: ${ev.target_hp_after} / ${ev.target_max_hp}`;
        }, 200);
      }

      setTimeout(resolve, 680);
    });
  }

  async function useMove(moveIdx) {
    if (isBusy || !currentBattleId) return;
    isBusy = true;
    document.querySelectorAll(".move-action-btn, .switch-chip").forEach(b => b.disabled = true);

    try {
      const res = await fetch(`${API_BASE}/battle/${currentBattleId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move_index: moveIdx })
      });
      const data = await res.json();

      for (const ev of (data.events || [])) {
        await playSingleEvent(ev);
      }

      isBusy = false;
      renderArena(data);
    } catch (err) {
      isBusy = false;
    }
  }

  async function switchPokemon(targetIdx) {
    if (isBusy || switchCooldown > 0 || !currentBattleId) return;
    isBusy = true;
    try {
      const res = await fetch(`${API_BASE}/battle/${currentBattleId}/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_idx: targetIdx })
      });
      const data = await res.json();
      isBusy = false;
      renderArena(data);
      startCooldown();
    } catch (err) {
      isBusy = false;
    }
  }

  function showReport(analytics) {
    const content = document.getElementById("arenaContent");
    const isWin = analytics.winner === "player";

    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h2 style="font-size:18px; font-weight:800; color:${isWin ? "#4ade80" : "#f87171"};">
          ${isWin ? "🏆 對戰勝利結算報告" : "💀 對戰戰敗復盤報告"} (總交鋒次數: ${analytics.total_actions})
        </h2>
        <button onclick="BattleModule.closeArena()" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;">&times;</button>
      </div>

      <div style="background:#0f172a; border:1px solid #38bdf8; border-radius:10px; padding:12px; margin-bottom:14px;">
        <div style="font-size:13px; font-weight:800; color:#38bdf8; margin-bottom:6px;">💡 Python 戰術診斷與隊伍調整建議</div>
        ${analytics.tactical_advice.map(a => `<div style="font-size:12px; color:#e2e8f0; margin:4px 0;">• ${a}</div>`).join("")}
      </div>

      <h3 style="font-size:14px; color:#f8fafc; margin-bottom:4px;">1. 寶可夢輸出與承傷貢獻榜</h3>
      <table class="report-table" style="margin-bottom:16px;">
        <thead>
          <tr><th>寶可夢</th><th>總輸出傷害</th><th>承受傷害</th><th>擊倒數</th><th>致命弱點來源</th></tr>
        </thead>
        <tbody>
          ${analytics.mvp_ranking.map(m => `
            <tr>
              <td style="font-weight:700; color:#f8fafc;">${m.name}</td>
              <td style="color:#4ade80; font-weight:700;">${m.damage_dealt}</td>
              <td style="color:#facc15;">${m.damage_taken}</td>
              <td>${m.kos}</td>
              <td style="color:#f87171;">${m.fatal_type}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <h3 style="font-size:14px; color:#f8fafc; margin-bottom:4px;">2. 招式實戰效益統計</h3>
      <table class="report-table">
        <thead>
          <tr><th>使用寶可夢</th><th>招式名稱</th><th>屬性</th><th>使用次數</th><th>平均單次傷害</th><th>效果絕佳次數</th></tr>
        </thead>
        <tbody>
          ${analytics.move_analytics.map(mv => `
            <tr>
              <td>${mv.pokemon}</td>
              <td style="font-weight:700; color:#38bdf8;">${mv.move_name}</td>
              <td>${mv.type_zh}</td>
              <td>${mv.uses} 次</td>
              <td style="font-weight:700;">${mv.avg_dmg}</td>
              <td style="color:#4ade80;">${mv.super_hits}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <button class="trainer-btn" style="width:100%; margin-top:16px; padding:10px;" onclick="BattleModule.closeArena()">返回圖鑑調整隊伍與配招</button>
    `;
  }

  function closeArena() {
    if (cdTimer) clearInterval(cdTimer);
    document.getElementById("battleArenaModal").style.display = "none";
  }

  setTimeout(init, 300);
  return { startMatch, useMove, switchPokemon, showReport, closeArena };
})();
