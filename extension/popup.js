const CM = globalThis.__velControllerMapper;
const KEY = "controller-mapper-config";
const $ = (id) => document.getElementById(id);

if (!CM) {
  document.body.textContent = "The fix did not load.";
} else {
  const hasChrome = Boolean(globalThis.chrome?.storage?.local);
  let config = CM.defaultConfig();

  const fields = [
    ["look-inner", "look-inner-out", (c) => c.look.innerDeadzone, (c, v) => { c.look.innerDeadzone = v; }, (v) => `${Math.round(v * 100)} %`],
    ["look-response", "look-response-out", (c) => c.look.response, (c, v) => { c.look.response = v; }, (v) => `${Number(v).toFixed(2)} · ${CM.curveWord(Number(v))}`],
    ["trigger", "trigger-out", (c) => c.triggers.threshold, (c, v) => { c.triggers.threshold = v; }, (v) => `${Math.round(v * 100)} %`],
    ["game-dead", "game-dead-out", (c) => c.look.gameDeadzone, (c, v) => { c.look.gameDeadzone = v; }, (v) => `${Math.round(v * 100)} %`],
    ["game-exp", "game-exp-out", (c) => c.look.gameExponent, (c, v) => { c.look.gameExponent = v; }, (v) => Number(v).toFixed(1)],
    ["range", "range-out", (c) => c.look.range, (c, v) => { c.look.range = v; }, (v) => `${Math.round(v * 100)} %`],
  ];

  const checks = [
    ["enabled", (c) => c.enabled, (c, v) => { c.enabled = v; }],
    ["look-compensate", (c) => c.look.compensate, (c, v) => { c.look.compensate = v; }],
    ["swap", (c) => c.swapSticks, (c, v) => { c.swapSticks = v; }],
    ["look-invert-x", (c) => c.look.invertX, (c, v) => { c.look.invertX = v; }],
    ["look-invert-y", (c) => c.look.invertY, (c, v) => { c.look.invertY = v; }],
    ["move-invert-x", (c) => c.move.invertX, (c, v) => { c.move.invertX = v; }],
    ["move-invert-y", (c) => c.move.invertY, (c, v) => { c.move.invertY = v; }],
  ];

  function updateSample() {
    const quarter = CM.previewLook(0.25, 0, config);
    const full = CM.previewLook(1, 0, config);
    $("sample").textContent = `At 25%: ${Math.round(quarter.rawSpeed)} → ${Math.round(quarter.mappedSpeed)} px/s. At full: ${Math.round(full.rawSpeed)} → ${Math.round(full.mappedSpeed)} px/s.`;
  }

  function updateOutputs() {
    for (const [, out, read, , format] of fields) $(out).textContent = format(read(config));
  }

  function fill() {
    for (const [id, read] of checks) $(id).checked = read(config);
    for (const [id, out, read, , format] of fields) {
      $(id).value = String(read(config));
      $(out).textContent = format(read(config));
    }
    updateSample();
    draw();
  }

  function draw() {
    const canvas = $("curve");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = canvas.clientHeight || 140;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#2a261f";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i += 1) {
      const y = 8 + ((h - 16) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
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
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    plot("rawSpeed", "#8d867b");
    plot("mappedSpeed", "#e25b2a");
  }

  async function persist() {
    config = CM.normalize(config);
    if (hasChrome) await chrome.storage.local.set({ [KEY]: config });
    else localStorage.setItem(KEY, JSON.stringify(config));
    updateOutputs();
    updateSample();
    draw();
  }

  function renderButtons() {
    const root = $("buttons");
    root.replaceChildren();
    for (const button of CM.BUTTONS) {
      const row = document.createElement("div");
      row.className = "button-row";
      const label = document.createElement("div");
      label.className = "action";
      const name = document.createElement("strong");
      name.textContent = button.action;
      const small = document.createElement("small");
      small.textContent = `normally ${button.name}`;
      label.append(name, small);
      const select = document.createElement("select");
      select.setAttribute("aria-label", button.action);
      const none = document.createElement("option");
      none.value = "-1";
      none.textContent = "None";
      select.append(none);
      for (const source of CM.BUTTONS) {
        const option = document.createElement("option");
        option.value = String(source.index);
        option.textContent = source.name;
        select.append(option);
      }
      select.value = String(config.buttons[button.index]);
      select.addEventListener("change", () => {
        config.buttons = CM.assignButton(config.buttons, button.index, Number(select.value));
        persist().then(renderButtons);
      });
      row.append(label, select);
      root.append(row);
    }
  }

  function renderKeys() {
    const root = $("keys");
    root.replaceChildren();
    config.keys.forEach((key, index) => {
      const row = document.createElement("div");
      row.className = "key-row";
      const code = document.createElement("strong");
      code.textContent = key.label || key.code;
      code.title = key.code;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Action for ${key.label || key.code}`);
      for (const button of CM.BUTTONS) {
        const option = document.createElement("option");
        option.value = String(button.index);
        option.textContent = button.action;
        select.append(option);
      }
      select.value = String(key.button);
      select.addEventListener("change", () => {
        config.keys[index].button = Number(select.value);
        persist();
      });
      const swallow = document.createElement("input");
      swallow.type = "checkbox";
      swallow.checked = key.swallow;
      swallow.title = "Block the key";
      const swallowLabel = document.createElement("label");
      swallowLabel.className = "check";
      swallowLabel.append(swallow, document.createTextNode(" Block"));
      swallow.addEventListener("change", () => {
        config.keys[index].swallow = swallow.checked;
        persist();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        config.keys.splice(index, 1);
        persist().then(renderKeys);
      });
      row.append(code, select, swallowLabel, remove);
      root.append(row);
    });
  }

  for (const [id, read, write] of checks) {
    $(id).addEventListener("change", () => {
      write(config, $(id).checked);
      persist();
    });
    void read;
  }

  for (const [id, , , write] of fields) {
    $(id).addEventListener("input", () => {
      write(config, Number($(id).value));
      persist();
    });
  }

  let capturing = false;
  $("add-key").addEventListener("click", () => {
    if (capturing) return;
    capturing = true;
    $("capture").hidden = false;
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.removeEventListener("keydown", onKey, true);
      capturing = false;
      $("capture").hidden = true;
      if (event.key === "Escape") return;
      const label = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      config.keys = config.keys.filter((key) => key.code !== event.code);
      config.keys.push({ code: event.code, button: 0, swallow: true, label });
      persist().then(renderKeys);
    };
    window.addEventListener("keydown", onKey, true);
  });

  $("reset").addEventListener("click", () => {
    config = CM.defaultConfig();
    persist().then(() => {
      fill();
      renderButtons();
      renderKeys();
    });
  });

  if (globalThis.chrome?.runtime?.openOptionsPage) {
    $("expand").addEventListener("click", () => chrome.runtime.openOptionsPage());
  } else {
    $("expand").hidden = true;
  }

  function pollPad() {
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    let pad = null;
    for (const candidate of pads || []) if (candidate?.connected) { pad = candidate; break; }
    if (!pad) {
      $("pad-status").textContent = "No controller seen in this window. Click the page, then move a stick.";
      $("pad-meter").textContent = "";
    } else {
      const look = Math.hypot(pad.axes?.[2] || 0, pad.axes?.[3] || 0);
      const move = Math.hypot(pad.axes?.[0] || 0, pad.axes?.[1] || 0);
      const preview = CM.previewLook(pad.axes?.[2] || 0, pad.axes?.[3] || 0, config);
      $("pad-status").textContent = pad.id || "Controller";
      $("pad-meter").textContent = `Right ${Math.round(look * 100)}% · left ${Math.round(move * 100)}% · look ${Math.round(preview.rawSpeed)} → ${Math.round(preview.mappedSpeed)} px/s`;
    }
    requestAnimationFrame(pollPad);
  }

  async function boot() {
    if (hasChrome) {
      const data = await chrome.storage.local.get(KEY);
      config = CM.normalize(data[KEY]);
      if (!data[KEY]) await chrome.storage.local.set({ [KEY]: config });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[KEY]?.newValue) return;
        const next = CM.normalize(changes[KEY].newValue);
        if (JSON.stringify(next) === JSON.stringify(config)) return;
        config = next;
        fill();
        renderButtons();
        renderKeys();
      });
    } else {
      try {
        config = CM.normalize(JSON.parse(localStorage.getItem(KEY) || "null"));
      } catch {
        config = CM.defaultConfig();
      }
    }
    fill();
    renderButtons();
    renderKeys();
    requestAnimationFrame(() => {
      draw();
      pollPad();
    });
  }

  boot();
}
