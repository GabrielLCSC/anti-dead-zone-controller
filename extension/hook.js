// At document start, in the page world. gamepad.js reads navigator.getGamepads()
// every frame: this function is replaced before the module loads.
(function () {
  if (globalThis.__velControllerMapperHook) return;
  const CM = globalThis.__velControllerMapper;
  if (!CM || typeof navigator.getGamepads !== "function") return;
  globalThis.__velControllerMapperHook = true;

  const KEY = "controller-mapper-config";
  const nativeGetGamepads = navigator.getGamepads.bind(navigator);
  const heldKeys = new Set();
  let config = readConfig();
  let persistTimer = 0;
  let panelOpen = false;
  let meter = 0;
  let paint = () => {};
  let setOpen = () => {};

  function readConfig() {
    try {
      return CM.normalize(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch {
      return CM.defaultConfig();
    }
  }

  function axesOf(pad) {
    try {
      return Array.from(pad?.axes ?? [], (value) => (Number.isFinite(Number(value)) ? Number(value) : 0));
    } catch {
      return [0, 0, 0, 0];
    }
  }

  function buttonsOf(pad) {
    try {
      return Array.from(pad?.buttons ?? []);
    } catch {
      return [];
    }
  }

  function wrap(pad) {
    if (!pad || !config.enabled) return pad;
    try {
      return {
        id: pad.id,
        index: pad.index,
        connected: pad.connected,
        mapping: pad.mapping,
        timestamp: pad.timestamp,
        axes: CM.remapAxes(axesOf(pad), config),
        buttons: CM.remapButtons(buttonsOf(pad), config, heldKeys),
        vibrationActuator: pad.vibrationActuator,
        hapticActuators: pad.hapticActuators,
      };
    } catch (error) {
      console.warn("[controller-mapper] axis skipped", error);
      return pad;
    }
  }

  function wrappedGetGamepads() {
    const list = nativeGetGamepads();
    const out = [];
    const count = list?.length ?? 0;
    for (let index = 0; index < count; index += 1) out.push(list[index] ? wrap(list[index]) : null);
    return out;
  }

  navigator.getGamepads = wrappedGetGamepads;
  if ("webkitGetGamepads" in navigator) navigator.webkitGetGamepads = wrappedGetGamepads;

  let lastWritten = JSON.stringify(config);

  function persist(next) {
    const raw = JSON.stringify(next);
    lastWritten = raw;
    try {
      localStorage.setItem(KEY, raw);
    } catch { /* private browsing */ }
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      window.postMessage({ source: "cm-page", type: "save", config: JSON.parse(raw) }, location.origin || "*");
    }, 80);
    if (typeof persistTimer?.unref === "function") persistTimer.unref();
  }

  function setConfig(next, options = {}) {
    const normalized = CM.normalize(next);
    const raw = JSON.stringify(normalized);
    if (raw === JSON.stringify(config)) return;
    config = normalized;
    if (options.persist !== false) persist(config);
    else lastWritten = raw;
    paint();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "cm-bridge" || event.data.type !== "config") return;
    setConfig(event.data.config, { persist: false });
  });

  const poll = setInterval(() => {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch { return; }
    if (!raw || raw === lastWritten) return;
    try {
      const normalized = CM.normalize(JSON.parse(raw));
      if (JSON.stringify(normalized) === JSON.stringify(config)) {
        lastWritten = raw;
        return;
      }
      setConfig(normalized, { persist: false });
    } catch { /* stale json */ }
  }, 200);
  if (typeof poll.unref === "function") poll.unref();

  function onKeyDown(event) {
    if (!config.enabled || !config.keys.some((key) => key.code === event.code)) return;
    heldKeys.add(event.code);
    const bind = config.keys.find((key) => key.code === event.code && key.swallow);
    if (bind) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", (event) => heldKeys.delete(event.code), true);
  window.addEventListener("blur", () => heldKeys.clear());

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function slider(name, min, max, step, value, format) {
    const wrap = el("label", "row");
    const head = el("span", "head");
    const output = el("output", "value", format(value));
    head.append(el("span", "name", name), output);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    wrap.append(head, input);
    return { wrap, input, output, format };
  }

  function mount() {
    if (!document.documentElement || document.getElementById("cm-root")) return;
    const host = el("div");
    host.id = "cm-root";
    host.style.cssText = "all:initial;position:fixed;top:10px;right:10px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = [
      ":host{all:initial}",
      "*{box-sizing:border-box;font:13px/1.4 ui-sans-serif,system-ui,sans-serif;color:#f4efe6}",
      "button,input{font:inherit}",
      ".pill,.panel{background:#1b1814;border:1px solid #3c342c;border-radius:10px;box-shadow:0 10px 30px #0008}",
      ".pill{padding:6px 10px;cursor:pointer}",
      ".panel{display:none;width:280px;padding:12px}",
      ".panel.open{display:block}",
      "h2{margin:0 0 8px;font-size:14px}",
      "p{margin:8px 0;color:#b7aea2}",
      ".row{display:block;margin:8px 0}",
      ".head{display:flex;justify-content:space-between;gap:8px}",
      ".value{color:#f0a05a;font-variant-numeric:tabular-nums}",
      "input[type=range]{width:100%;margin-top:4px;accent-color:#e25b2a}",
      ".check{display:flex;align-items:center;gap:8px;margin:8px 0}",
      ".meter{display:grid;gap:4px;padding:8px;background:#12100e;border-radius:8px}",
      ".actions{display:flex;justify-content:space-between;margin-top:8px}",
      "button.quiet{background:transparent;color:#b7aea2;border:0;padding:0;cursor:pointer}",
    ].join("");

    const pill = el("button", "pill", "Controller");
    pill.type = "button";
    const panel = el("div", "panel");
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    const enabled = el("label", "check");
    enabled.append(enabledInput, document.createTextNode(" Fix on"));
    const lookInner = slider("Look deadzone", 0, 0.3, 0.01, config.look.innerDeadzone, (value) => `${Math.round(value * 100)}%`);
    const response = slider("Look curve", 0.5, 2.5, 0.05, config.look.response, (value) => `${Number(value).toFixed(2)} · ${CM.curveWord(Number(value))}`);
    const sample = el("p");
    const live = el("div", "meter");
    const reset = el("button", "quiet", "Reset");
    reset.type = "button";
    const close = el("button", "quiet", "Close");
    close.type = "button";
    const actions = el("div", "actions");
    actions.append(reset, close);
    panel.append(
      el("h2", null, "Deadzone"),
      enabled,
      lookInner.wrap,
      response.wrap,
      sample,
      live,
      actions,
      el("p", null, "The left stick is unchanged. Rebind buttons from the extension icon."),
    );
    shadow.append(style, pill, panel);
    document.documentElement.appendChild(host);

    const controls = [
      [lookInner, () => config.look.innerDeadzone],
      [response, () => config.look.response],
    ];

    paint = () => {
      const focused = shadow.activeElement;
      enabledInput.checked = config.enabled;
      for (const [control, read] of controls) {
        const value = focused === control.input ? Number(control.input.value) : read();
        if (focused !== control.input) control.input.value = String(read());
        control.output.textContent = control.format(value);
      }
      const at = CM.previewLook(0.25, 0, config);
      sample.textContent = `At 25% stick: ${Math.round(at.rawSpeed)} → ${Math.round(at.mappedSpeed)} px/s of look.`;
    };

    function tick() {
      if (!panelOpen) {
        meter = 0;
        return;
      }
      const pads = nativeGetGamepads() || [];
      let pad = null;
      for (let index = 0; index < pads.length; index += 1) if (pads[index]?.connected) { pad = pads[index]; break; }
      live.replaceChildren();
      if (!pad) {
        live.append(el("span", null, "Move a stick to show the raw deflection."));
      } else {
        const axes = axesOf(pad);
        const mapped = config.enabled ? CM.remapAxes(axes, config) : axes;
        const rawSpeed = Math.hypot(...CM.siteLookVelocity(axes[2] || 0, axes[3] || 0));
        const newSpeed = Math.hypot(...CM.siteLookVelocity(mapped[2] || 0, mapped[3] || 0));
        live.append(el("span", null, `Right stick ${Math.round(Math.hypot(axes[2] || 0, axes[3] || 0) * 100)}% → look ${Math.round(rawSpeed)} → ${Math.round(newSpeed)} px/s`));
      }
      meter = requestAnimationFrame(tick);
    }

    setOpen = (next) => {
      panelOpen = next;
      panel.classList.toggle("open", next);
      pill.hidden = next;
      if (next) {
        paint();
        if (!meter) meter = requestAnimationFrame(tick);
      } else if (meter) {
        cancelAnimationFrame(meter);
        meter = 0;
      }
    };

    pill.addEventListener("click", () => setOpen(true));
    close.addEventListener("click", () => setOpen(false));
    enabledInput.addEventListener("change", () => setConfig({ ...config, enabled: enabledInput.checked }));
    lookInner.input.addEventListener("input", () => {
      setConfig({ ...config, look: { ...config.look, innerDeadzone: Number(lookInner.input.value) } });
    });
    response.input.addEventListener("input", () => {
      setConfig({ ...config, look: { ...config.look, response: Number(response.input.value) } });
    });
    reset.addEventListener("click", () => setConfig(CM.defaultConfig()));
    paint();
  }

  function tryMount() {
    try {
      mount();
    } catch (error) {
      console.warn("[controller-mapper] panel unavailable", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tryMount, { once: true });
  else tryMount();

  globalThis.__velControllerMapperDebug = {
    get config() { return config; },
    nativeGetGamepads,
    setConfig,
  };
  console.info("[controller-mapper] active");
})();
