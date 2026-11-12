const ModalModule = (() => {
  const statNames = {
    hp: 'HP 生命',
    attack: '物理攻擊',
    defense: '物理防禦',
    'special-attack': '特殊攻擊',
    'special-defense': '特殊防禦',
    speed: '出手速度'
  };

  function getZhName(namesList, fallback) {
    if (!namesList) return fallback;
    const hant = namesList.find(n => ['zh-hant', 'zh-tw'].includes(n.language.name.toLowerCase()));
    if (hant) return hant.name;
    const hans = namesList.find(n => ['zh-hans', 'zh-cn', 'zh'].includes(n.language.name.toLowerCase()));
    return hans ? hans.name : fallback;
  }

  function init() {
    if (!document.getElementById('pokeModal')) {
      const modalEl = document.createElement('div');
      modalEl.id = 'pokeModal';
      modalEl.className = 'modal-overlay';
      modalEl.onclick = close;
      modalEl.innerHTML = `
        <div class="modal-content" onclick="event.stopPropagation()">
          <button class="modal-close" onclick="ModalModule.close()">&times;</button>
          <div id="modalBody"></div>
        </div>
      `;
      document.body.appendChild(modalEl);
    }
  }

  function getStatColor(val) {
    if (val >= 120) return '#38bdf8';
    if (val >= 90) return '#4ade80';
    if (val >= 60) return '#facc15';
    return '#f87171';
  }

  async function open(pokemonId) {
    init();
    const modal = document.getElementById('pokeModal');
    const modalBody = document.getElementById('modalBody');
    modal.style.display = 'flex';
    modalBody.innerHTML = '<p style="text-align: center; padding: 30px; color: #94a3b8;">正在讀取中文圖鑑資料...</p>';

    try {
      const [res, speciesRes] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`)
      ]);
      if (!res.ok) throw new Error('API 讀取失敗');
      const data = await res.json();
      const species = speciesRes.ok ? await speciesRes.json() : null;

      const pureName = getZhName(species?.names, data.name.toUpperCase());
      const spriteUrl = data.sprites.other['official-artwork'].front_default || data.sprites.front_default;
      const types = data.types.map(t => t.type.name);

      let totalStats = 0;
      const statsHtml = data.stats.map(s => {
        totalStats += s.base_stat;
        const label = statNames[s.stat.name] || s.stat.name;
        const pct = Math.min(100, Math.round((s.base_stat / 200) * 100));
        const barColor = getStatColor(s.base_stat);
        return `
          <div style="display: flex; align-items: center; margin: 10px 0; gap: 10px;">
            <span style="width: 72px; font-size: 13px; font-weight: 700; color: #cbd5e1; text-align: left; flex-shrink: 0;">${label}</span>
            <span style="width: 34px; font-size: 13px; font-weight: 800; color: #f8fafc; text-align: right; flex-shrink: 0;">${s.base_stat}</span>
            <div style="flex-grow: 1; background: #0b0f19; height: 10px; border-radius: 6px; overflow: hidden;">
              <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 6px; transition: width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');

      const abilities = data.abilities.map(a => a.ability.name).join(', ');
      const payload = JSON.stringify({ id: data.id, name: pureName, sprite_url: spriteUrl, types }).replace(/"/g, '&quot;');

      modalBody.innerHTML = `
        <div style="text-align: center;">
          <img src="${spriteUrl}" style="width: 135px; height: 135px; object-fit: contain;" />
          <div style="color: #38bdf8; font-weight: 700; font-size: 13px; margin-top: 4px;">#${String(data.id).padStart(4, '0')}</div>
          <h2 style="font-size: 22px; font-weight: 800; margin: 4px 0 6px; color: #f8fafc;">${pureName}</h2>
          <p style="color: #94a3b8; font-size: 13px;">身高: ${data.height / 10} m ｜ 體重: ${data.weight / 10} kg</p>
          <p style="color: #64748b; font-size: 12px; margin-top: 4px;">特性代碼: ${abilities}</p>
          <button class="trainer-btn" style="margin-top: 14px; padding: 10px 20px;" onclick="TeamModule.addPokemon(${payload})">+ 加入我的對戰隊伍</button>
        </div>
        <hr style="margin: 18px 0; border: none; border-top: 1px solid #233252;" />
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3 style="font-size: 15px; color: #f8fafc;">六維種族值</h3>
          <span style="font-size: 12px; color: #38bdf8; font-weight: 700;">種族值總和：${totalStats}</span>
        </div>
        ${statsHtml}
      `;
    } catch (err) {
      modalBody.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 20px;">數據載入失敗，請稍後再試</p>';
    }
  }

  function close() {
    const modal = document.getElementById('pokeModal');
    if (modal) modal.style.display = 'none';
  }

  return { open, close };
})();
