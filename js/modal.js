const ModalModule = (() => {
  const statNames = {
    hp: 'HP',
    attack: '攻擊',
    defense: '防禦',
    'special-attack': '特攻',
    'special-defense': '特防',
    speed: '速度'
  };

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

  async function open(pokemonId) {
    init();
    const modal = document.getElementById('pokeModal');
    const modalBody = document.getElementById('modalBody');
    modal.style.display = 'flex';
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px; color: #94a3b8;">載入數據中...</p>';

    try {
      const [res, speciesRes] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`)
      ]);
      if (!res.ok) throw new Error('API 讀取失敗');
      const data = await res.json();
      const species = speciesRes.ok ? await speciesRes.json() : null;

      const zhEntry = species?.names?.find(n => n.language.name === 'zh-Hant' || n.language.name === 'zh-Hans');
      const displayName = zhEntry ? `${zhEntry.name} (${data.name.toUpperCase()})` : data.name.toUpperCase();

      const statsHtml = data.stats.map(s => {
        const name = statNames[s.stat.name] || s.stat.name;
        const pct = Math.min(100, Math.round((s.base_stat / 255) * 100));
        return `
          <div class="stat-row">
            <span class="stat-name">${name}</span>
            <div class="stat-bar-bg">
              <div class="stat-bar-fill" style="width: ${pct}%;"></div>
            </div>
            <span class="stat-val">${s.base_stat}</span>
          </div>
        `;
      }).join('');

      const abilities = data.abilities.map(a => a.ability.name).join(', ');

      modalBody.innerHTML = `
        <div style="text-align: center;">
          <img src="${data.sprites.other['official-artwork'].front_default || data.sprites.front_default}" style="width: 150px; height: 150px; object-fit: contain;" />
          <div style="color: #38bdf8; font-weight: 700; font-size: 13px; margin-top: 8px;">#${String(data.id).padStart(4, '0')}</div>
          <h2 style="font-size: 20px; margin: 4px 0 8px;">${displayName}</h2>
          <p style="color: #94a3b8; font-size: 13px;">身高: ${data.height / 10} m | 體重: ${data.weight / 10} kg</p>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">特性: ${abilities}</p>
        </div>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #233252;" />
        <h3 style="margin-bottom: 12px; font-size: 15px; color: #f8fafc;">六維種族值</h3>
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
