const TeamModule = (() => {
  const API_BASE = "http://127.0.0.1:8001/api";
  const TYPE_ZH = {
    normal: "一般", fire: "火", water: "水", grass: "草", electric: "電",
    ice: "冰", fighting: "格鬥", poison: "毒", ground: "地面", flying: "飛行",
    psychic: "超能力", bug: "蟲", rock: "岩石", ghost: "幽靈", dragon: "龍",
    steel: "鋼", dark: "惡", fairy: "妖精"
  };
  const CLASS_ZH = { physical: "物理", special: "特殊", status: "變化" };

  let currentTrainer = localStorage.getItem("trainer_id") || "";
  let currentTeam = [];

  function notify(msg, type = "success") {
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = `toast-msg ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function init() {
    const container = document.querySelector(".container");
    const genNav = document.getElementById("genNav");
    if (!container || !genNav) return;

    const panel = document.createElement("div");
    panel.id = "teamPanel";
    panel.innerHTML = `
      <div class="trainer-bar">
        <div id="trainerStatus" style="font-size: 14px; font-weight: 700; color: #38bdf8;">
          請輸入訓練家代號以載入專屬 6 隻對戰隊伍
        </div>
        <div class="trainer-login-group">
          <input type="text" id="trainerInput" class="trainer-input" placeholder="輸入代號 (例: Jim)" value="${currentTrainer}">
          <button class="trainer-btn" onclick="TeamModule.login()">載入隊伍</button>
        </div>
      </div>
      <div class="team-slots-grid" id="teamSlotsGrid"></div>
    `;
    container.insertBefore(panel, genNav);

    renderSlots();
    if (currentTrainer) ModalModule.close();
      login(true);
  }

  async function login(silent = false) {
    const input = document.getElementById("trainerInput");
    const id = input.value.trim();
    if (!id) return notify("請先輸入訓練家代號！", "warn");
    currentTrainer = id;
    localStorage.setItem("trainer_id", id);
    const gbaFrame = document.getElementById("gbaGameFrame");
    if (gbaFrame && gbaFrame.contentWindow) {
      gbaFrame.contentWindow.postMessage({ type: "SYNC_TRAINER", trainerId: id }, "*");
    }

    try {
      const res = await fetch(`${API_BASE}/team/${encodeURIComponent(id)}`);
      const data = await res.json();
      currentTeam = data.team || [];
      document.getElementById("trainerStatus").innerHTML =
        `訓練家 <span style="color:#fff;">${currentTrainer}</span> 的對戰陣容 (${currentTeam.length} / 6 隻) <span style="font-size:12px;color:#94a3b8;font-weight:normal;">(點擊隊伍成員可設定中文招式)</span>`;
      renderSlots();
      if (!silent) notify(`已載入訓練家 ${currentTrainer} 的隊伍`, "success");
    } catch (err) {
      document.getElementById("trainerStatus").innerHTML =
        `<span style="color:#ef4444;">無法連線至 Python 後端 (請確認 Port 8001 運行中)</span>`;
      notify("Python 後端未連線", "error");
    }
  }

  function renderSlots() {
    const grid = document.getElementById("teamSlotsGrid");
    if (!grid) return;
    let html = "";
    for (let i = 0; i < 6; i++) {
      const member = currentTeam[i];
      if (member) {
        html += `
          <div class="team-slot filled" onclick="TeamModule.openMoveEditor(${member.slot_id})">
            <button class="slot-remove" title="移出隊伍" onclick="event.stopPropagation(); TeamModule.removeMember(${member.slot_id})">&times;</button>
            <img class="slot-img" src="${member.sprite_url}" alt="${member.pokemon_name}">
            <div class="slot-name">${member.pokemon_name}</div>
            <div class="slot-sub">已配 ${member.moves.length} 招 (點擊調整)</div>
          </div>
        `;
      } else {
        html += `
          <div class="team-slot">
            <div style="color:#64748b; font-size:12px;">空位 #${i + 1}</div>
          </div>
        `;
      }
    }
    grid.innerHTML = html;
  }

  async function addPokemon(pokemonData) {
    if (!currentTrainer) {
      notify("請先在上方輸入訓練家代號！", "warn");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainer_id: currentTrainer,
          pokemon_id: pokemonData.id,
          pokemon_name: pokemonData.name,
          sprite_url: pokemonData.sprite_url,
          types: pokemonData.types
        })
      });
      const data = await res.json();
      if (!res.ok) return notify(data.detail || "加入失敗", "error");
      currentTeam = data.team;
      ModalModule.close();
      login(true);
      notify(`已將「${pokemonData.name}」加入對戰隊伍！`, "success");
    } catch (err) {
      notify("連線後端失敗，請確認伺服器啟動中", "error");
    }
  }

  async function removeMember(slotId) {
    const res = await fetch(`${API_BASE}/team/${slotId}?trainer_id=${encodeURIComponent(currentTrainer)}`, {
      method: "DELETE"
    });
    if (res.ok) {
      ModalModule.close();
      login(true);
      notify("已從隊伍移出成員", "warn");
    }
  }

  async function openMoveEditor(slotId) {
    const member = currentTeam.find(m => m.slot_id === slotId);
    if (!member) return;

    const modal = document.getElementById("pokeModal");
    const modalBody = document.getElementById("modalBody");
    modal.style.display = "flex";
    modalBody.innerHTML = `<p style="text-align:center; padding:30px; color:#94a3b8;">正在載入 ${member.pokemon_name} 的中文招式庫...</p>`;

    const res = await fetch(`${API_BASE}/pokemon/${member.pokemon_id}/moves`);
    const data = await res.json();
    const allMoves = data.moves || [];
    let selectedMoves = [...member.moves];

    function renderEditor() {
      const selectedIds = new Set(selectedMoves.map(m => m.id));

      let equippedHtml = "";
      for (let i = 0; i < 4; i++) {
        const m = selectedMoves[i];
        if (m) {
          equippedHtml += `
            <div class="equipped-slot">
              <button class="move-cancel-btn" title="取消此招式" onclick="TeamModule._removeMove(${m.id})">&times;</button>
              <div style="font-size:13px; font-weight:800; color:#f8fafc; padding-right:18px;">${m.name}</div>
              <div style="font-size:11px; color:#94a3b8; margin-top:3px;">
                <span class="type-tag type-${m.type}" style="padding:1px 6px; font-size:10px;">${TYPE_ZH[m.type] || m.type}</span>
                ${CLASS_ZH[m.damage_class] || ''} ｜ 威力 ${m.power}
              </div>
            </div>
          `;
        } else {
          equippedHtml += `<div class="equipped-slot empty">+ 點擊下方招式加入</div>`;
        }
      }

      const poolHtml = allMoves.map(m => {
        const isSelected = selectedIds.has(m.id);
        return `
          <div class="pool-card ${isSelected ? 'disabled' : ''}" onclick="${isSelected ? '' : `TeamModule._addMove(${m.id})`}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:13px; font-weight:700; color:#f8fafc;">${m.name}</span>
              <span class="type-tag type-${m.type}" style="padding:1px 6px; font-size:10px;">${TYPE_ZH[m.type] || m.type}</span>
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
              ${CLASS_ZH[m.damage_class] || ''} ｜ 威力:${m.power} ｜ 命中:${m.accuracy}%
            </div>
          </div>
        `;
      }).join("");

      modalBody.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
          <img src="${member.sprite_url}" style="width:64px; height:64px; background:#0b0f19; border-radius:12px; padding:4px;">
          <div>
            <h3 style="color:#38bdf8; font-size:18px; font-weight:800;">${member.pokemon_name}</h3>
            <p style="font-size:12px; color:#94a3b8;">自由配置戰鬥招式 (${selectedMoves.length} / 4)</p>
          </div>
        </div>
        <div style="font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:6px;">已裝備招式（點擊右上角 × 可直接取消）：</div>
        <div class="equipped-grid">${equippedHtml}</div>
        <div style="font-size:12px; font-weight:700; color:#cbd5e1; margin-bottom:6px;">可學習招式資料庫（點擊直接裝備）：</div>
        <div class="pool-grid">${poolHtml}</div>
        <button class="trainer-btn" style="width:100%; margin-top:14px; padding:10px;" onclick="TeamModule._saveMoves(${slotId})">確認並儲存配招</button>
      `;
    }

    TeamModule._removeMove = (moveId) => {
      selectedMoves = selectedMoves.filter(m => m.id !== moveId);
      renderEditor();
    };

    TeamModule._addMove = (moveId) => {
      if (selectedMoves.length >= 4) {
        notify("已滿 4 個招式，請先點擊右上角 × 取消一個！", "warn");
        return;
      }
      const target = allMoves.find(m => m.id === moveId);
      if (target && !selectedMoves.some(m => m.id === moveId)) {
        selectedMoves.push(target);
        renderEditor();
      }
    };

    TeamModule._saveMoves = async (sId) => {
      if (selectedMoves.length === 0) {
        return notify("請至少保留 1 個戰鬥招式！", "warn");
      }
      const putRes = await fetch(`${API_BASE}/team/${sId}/moves`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainer_id: currentTrainer, moves: selectedMoves, note: "" })
      });
      if (putRes.ok) {
        document.getElementById("pokeModal").style.display = "none";
        ModalModule.close();
      login(true);
        notify(`已儲存 ${member.pokemon_name} 的新配招！`, "success");
      }
    };

    renderEditor();
  }

  document.addEventListener("DOMContentLoaded", init);
  return { login, addPokemon, removeMember, openMoveEditor };
})();
