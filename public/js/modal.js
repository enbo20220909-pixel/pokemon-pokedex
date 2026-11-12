// 詳細彈窗模組（Modal Component）
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
    // 動態注入彈窗 HTML 容器，避免污染 index.html 骨架
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
    modalBody.innerHTML = '<p style="text-align: center; padding: 20px;">載入數據中...</p>';

    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);
      if (!res.ok) throw new Error('API 讀取失敗');
      const data = await res.json();

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
          <img src="${data.sprites.other['official-artwork'].front_default || data.sprites.front_default}" style="width: 160px; height: 160px;" />
          <h2>#${String(data.id).padStart(3, '0')} ${data.name.toUpperCase()}</h2>
          <p style="color: #666; font-size: 14px;">身高: ${data.height / 10} m | 體重: ${data.weight / 10} kg</p>
          <p style="color: #666; font-size: 14px;">特性: ${abilities}</p>
        </div>
        <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="margin-bottom: 12px; font-size: 16px;">六維種族值</h3>
        ${statsHtml}
      `;
    } catch (err) {
      modalBody.innerHTML = '<p style="color: red; text-align: center;">數據載入失敗，請稍後再試</p>';
    }
  }

  function close() {
    const modal = document.getElementById('pokeModal');
    if (modal) modal.style.display = 'none';
  }

  // 對外公開安全介面
  return {
    open,
    close
  };
})();