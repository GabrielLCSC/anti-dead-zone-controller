const CM = globalThis.__velControllerMapper;
const config = CM.defaultConfig();
const state = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };

function speedText(raw, mapped) {
  return `${Math.round(raw)} → ${Math.round(mapped)} px/s`;
}

function draw() {
  const canvas = document.getElementById("curve");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 160;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const points = CM.lookCurve(config, 48);
  const max = CM.GAME.lookSpeed;
  const plot = (key, color) => {
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = 8 + point.physical * (w - 16);
      const y = h - 8 - (point[key] / max) * (h - 16);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };
  plot("rawSpeed", "#8d867b");
  plot("mappedSpeed", "#e25b2a");
  const example = CM.previewLook(0.25, 0, config);
  document.getElementById("example").textContent = `At 25% right stick, the site’s look goes from ${speedText(example.rawSpeed, example.mappedSpeed)}.`;
}

function place(pad, x, y, className) {
  let knob = pad.querySelector(".stick");
  if (!knob) {
    knob = document.createElement("div");
    knob.className = `stick ${className || ""}`;
    pad.append(knob);
  }
  knob.style.left = `${(x + 1) * 50}%`;
  knob.style.top = `${(y + 1) * 50}%`;
}

function render() {
  const mapped = CM.remapAxes([state.moveX, state.moveY, state.lookX, state.lookY], config);
  const rawLook = Math.hypot(...CM.siteLookVelocity(state.lookX, state.lookY));
  const newLook = Math.hypot(...CM.siteLookVelocity(mapped[2], mapped[3]));
  const names = { left: "left", right: "right", up: "up", down: "down" };
  const label = (dirs) => (dirs.length ? dirs.map((dir) => names[dir]).join(", ") : "still");
  const rawDirs = [...CM.siteMoveDirections(state.moveX, state.moveY)];
  document.getElementById("look-readout").textContent = `Deflection ${Math.round(Math.hypot(state.lookX, state.lookY) * 100)}%. Look ${speedText(rawLook, newLook)}.`;
  document.getElementById("move-readout").textContent = `Unchanged: ${label(rawDirs)}.`;
  place(document.getElementById("move-pad"), state.moveX, state.moveY);
  place(document.getElementById("look-pad"), state.lookX, state.lookY);
  draw();
}

function bindPad(id, set) {
  const pad = document.getElementById(id);
  const point = (event) => {
    const rect = pad.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    render();
  };
  pad.addEventListener("pointerdown", (event) => {
    pad.setPointerCapture(event.pointerId);
    point(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (pad.hasPointerCapture(event.pointerId)) point(event);
  });
}

bindPad("move-pad", (x, y) => {
  state.moveX = x;
  state.moveY = y;
});
bindPad("look-pad", (x, y) => {
  state.lookX = x;
  state.lookY = y;
});

window.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 0.05 : 0.25;
  if (event.key === "ArrowRight") state.lookX = Math.min(1, state.lookX + step);
  else if (event.key === "ArrowLeft") state.lookX = Math.max(-1, state.lookX - step);
  else if (event.key === "ArrowUp") state.lookY = Math.max(-1, state.lookY - step);
  else if (event.key === "ArrowDown") state.lookY = Math.min(1, state.lookY + step);
  else return;
  event.preventDefault();
  render();
});

globalThis.__demo = {
  config,
  state,
  setLook(x, y) {
    state.lookX = x;
    state.lookY = y;
    render();
  },
  setMove(x, y) {
    state.moveX = x;
    state.moveY = y;
    render();
  },
  render,
};

render();
