const VfxModule = (() => {
  const TYPE_FLASH_COLOR = {
    fire: "rgba(249, 115, 22, 0.35)",
    water: "rgba(56, 189, 248, 0.35)",
    electric: "rgba(250, 204, 21, 0.45)",
    grass: "rgba(74, 222, 128, 0.32)",
    ice: "rgba(103, 232, 249, 0.38)",
    psychic: "rgba(232, 121, 249, 0.35)",
    ghost: "rgba(99, 102, 241, 0.38)",
    dragon: "rgba(239, 68, 68, 0.35)",
    fairy: "rgba(244, 114, 182, 0.35)"
  };

  const KNOWN_CLASSES = new Set([
    "fire", "water", "electric", "grass", "ice",
    "psychic", "ghost", "dragon", "fairy"
  ]);

  function playMoveEffect(moveType, targetSide) {
    const stage = document.querySelector(".battle-stage-diagonal");
    if (!stage) return;

    let layer = stage.querySelector(".vfx-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "vfx-layer";
      stage.appendChild(layer);
    }

    // 1. 全屏屬性微閃光
    if (TYPE_FLASH_COLOR[moveType]) {
      const flash = document.createElement("div");
      flash.className = "vfx-screen-flash";
      flash.style.background = TYPE_FLASH_COLOR[moveType];
      layer.appendChild(flash);
      setTimeout(() => flash.remove(), 400);
    }

    // 2. 在目標位置生成對應屬性粒子特效
    const proj = document.createElement("div");
    const vfxClass = KNOWN_CLASSES.has(moveType) ? `vfx-${moveType}` : "vfx-default";
    proj.className = `vfx-projectile ${vfxClass}`;

    if (targetSide === "enemy") {
      proj.style.top = "28%";
      proj.style.right = "14%";
    } else {
      proj.style.bottom = "12%";
      proj.style.left = "16%";
    }

    layer.appendChild(proj);
    setTimeout(() => proj.remove(), 620);
  }

  return { playMoveEffect };
})();
