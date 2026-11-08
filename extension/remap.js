// Inverse of the curve in https://vel.gg/bsz/gamepad.js (captured 2026-11-08).
// The site does not read the stick as an analog axis:
//   look : radius <= 0.18 → 0, otherwise speed = 1100 * ((radius - 0.18) / 0.82) ** 2
//   move : |axis| >= 0.35 to engage a direction, then a WASD key (all or nothing)
// Axes are rewritten BEFORE that function so the felt speed follows the stick.
// This file runs as-is in the page, the settings window, and the tests.
(function (root) {
  const GAME = Object.freeze({
    lookDeadzone: 0.18,
    lookExponent: 2,
    lookSpeed: 1100,
    lookAimScale: 0.45,
    sensitivityMin: 0.25,
    sensitivityMax: 3,
    moveActivate: 0.35,
    moveRelease: 0.25,
    buttonPress: 0.55,
  });

  const BUTTONS = Object.freeze([
    { index: 0, name: "Cross", action: "Jump" },
    { index: 1, name: "Circle", action: "Crouch" },
    { index: 2, name: "Square", action: "Use / reload" },
    { index: 3, name: "Triangle", action: "Next weapon" },
    { index: 4, name: "L1", action: "Tactical grenade" },
    { index: 5, name: "R1", action: "Frag grenade" },
    { index: 6, name: "L2", action: "Aim" },
    { index: 7, name: "R2", action: "Fire" },
    { index: 8, name: "Create", action: "Scores" },
    { index: 9, name: "Options", action: "Pause" },
    { index: 10, name: "L3", action: "Sprint" },
    { index: 11, name: "R3", action: "Melee" },
    { index: 12, name: "Up", action: "Slot 1" },
    { index: 13, name: "Down", action: "Slot 4" },
    { index: 14, name: "Left", action: "Slot 2" },
    { index: 15, name: "Right", action: "Slot 3" },
  ]);

  function identityButtons() {
    return BUTTONS.map((button) => button.index);
  }

  function defaultConfig() {
    return {
      enabled: true,
      swapSticks: false,
      look: {
        compensate: true,
        gameDeadzone: GAME.lookDeadzone,
        gameExponent: GAME.lookExponent,
        response: 1,
        innerDeadzone: 0.06,
        range: 1,
        invertX: false,
        invertY: false,
      },
      move: {
        invertX: false,
        invertY: false,
      },
      triggers: { threshold: GAME.buttonPress },
      buttons: identityButtons(),
      keys: [],
    };
  }

  function num(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function flag(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
  }

  function normalize(input) {
    const base = defaultConfig();
    const src = input && typeof input === "object" ? input : {};
    const look = src.look && typeof src.look === "object" ? src.look : {};
    const move = src.move && typeof src.move === "object" ? src.move : {};
    const triggers = src.triggers && typeof src.triggers === "object" ? src.triggers : {};
    base.enabled = flag(src.enabled, true);
    base.swapSticks = flag(src.swapSticks, false);
    base.look = {
      compensate: flag(look.compensate, true),
      gameDeadzone: num(look.gameDeadzone, GAME.lookDeadzone, 0, 0.9),
      gameExponent: num(look.gameExponent, GAME.lookExponent, 0.5, 4),
      response: num(look.response, 1, 0.35, 3),
      innerDeadzone: num(look.innerDeadzone, 0.06, 0, 0.5),
      range: num(look.range, 1, 0.3, 1),
      invertX: flag(look.invertX, false),
      invertY: flag(look.invertY, false),
    };
    base.move = {
      invertX: flag(move.invertX, false),
      invertY: flag(move.invertY, false),
    };
    base.triggers = {
      threshold: num(triggers.threshold, GAME.buttonPress, 0.02, 1),
    };
    base.buttons = identityButtons().map((fallback, index) => {
      const n = Number(Array.isArray(src.buttons) ? src.buttons[index] : fallback);
      return Number.isInteger(n) && n >= -1 && n <= 31 ? n : fallback;
    });
    base.keys = Array.isArray(src.keys)
      ? src.keys.slice(0, 32).filter((key) => key && typeof key.code === "string" && key.code.length > 0 && key.code.length < 40).map((key) => ({
          code: key.code,
          button: Math.round(num(key.button, 0, 0, 15)),
          swallow: key.swallow !== false,
          label: typeof key.label === "string" && key.label ? key.label.slice(0, 24) : key.code,
        }))
      : [];
    return base;
  }

  function clampAxis(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
  }

  // Copy of the look-speed calculation in gamepad.js, for the preview and the tests.
  function siteLookVelocity(x, y, { sensitivity = 1, invertY = false, aiming = false } = {}) {
    x = clampAxis(x);
    y = clampAxis(y);
    const length = Math.hypot(x, y);
    if (length <= GAME.lookDeadzone) return [0, 0];
    const speed = GAME.lookSpeed
      * ((Math.min(1, length) - GAME.lookDeadzone) / (1 - GAME.lookDeadzone)) ** GAME.lookExponent
      * Math.max(GAME.sensitivityMin, Math.min(GAME.sensitivityMax, Number(sensitivity) || 1))
      * (aiming ? GAME.lookAimScale : 1);
    return [(x / length) * speed, (y / length) * speed * (invertY ? -1 : 1)];
  }

  function siteMoveDirections(x, y, previous = new Set()) {
    const ax = clampAxis(x);
    const ay = clampAxis(y);
    const values = { left: -ax, right: ax, up: -ay, down: ay };
    return new Set(
      Object.entries(values)
        .filter(([key, value]) => value >= (previous.has(key) ? GAME.moveRelease : GAME.moveActivate))
        .map(([key]) => key),
    );
  }

  function shapeLook(x, y, look) {
    if (look.invertX) x = -x;
    if (look.invertY) y = -y;
    if (!look.compensate) return [x, y];

    x /= look.range;
    y /= look.range;
    let mag = Math.hypot(x, y);
    if (!Number.isFinite(mag) || mag === 0) return [0, 0];
    if (mag > 1) {
      x /= mag;
      y /= mag;
      mag = 1;
    }
    if (mag <= look.innerDeadzone) return [0, 0];

    const p = (mag - look.innerDeadzone) / (1 - look.innerDeadzone);
    // The site raises its internal value to the hardcoded exponent. This value is
    // chosen so the speed it computes follows p raised to the selected curve.
    // At full deflection the speed stays the site's: there is no multiplier.
    const t = p <= 0 ? 0 : Math.pow(p, look.response / look.gameExponent);
    let out = look.gameDeadzone + (1 - look.gameDeadzone) * t;
    if (p > 0 && out <= look.gameDeadzone) out = Math.min(1, look.gameDeadzone + 1e-3);
    out = Math.min(1, out);
    const scale = out / mag;
    return [x * scale, y * scale];
  }

  function shapeMove(x, y, move) {
    // The left stick stays the site's. Only an explicit invert changes it.
    if (move.invertX) x = -x;
    if (move.invertY) y = -y;
    return [x, y];
  }

  function remapAxes(axes, config) {
    const cfg = normalize(config);
    const ax = Array.from(axes ?? [], (value) => (Number.isFinite(Number(value)) ? Number(value) : 0));
    while (ax.length < 4) ax.push(0);
    let lx = ax[0];
    let ly = ax[1];
    let rx = ax[2];
    let ry = ax[3];
    if (cfg.swapSticks) {
      [lx, rx] = [rx, lx];
      [ly, ry] = [ry, ly];
    }
    [lx, ly] = shapeMove(lx, ly, cfg.move);
    [rx, ry] = shapeLook(rx, ry, cfg.look);
    ax[0] = lx;
    ax[1] = ly;
    ax[2] = rx;
    ax[3] = ry;
    return ax;
  }

  function buttonState(button) {
    return {
      pressed: Boolean(button?.pressed),
      touched: Boolean(button?.touched),
      value: Number.isFinite(Number(button?.value)) ? Number(button.value) : button?.pressed ? 1 : 0,
    };
  }

  function shapeTrigger(button, threshold) {
    const current = buttonState(button);
    if (threshold >= GAME.buttonPress - 1e-6) return current;
    if (current.value < threshold) {
      return { pressed: false, touched: current.touched, value: current.value };
    }
    const p = (current.value - threshold) / (1 - threshold);
    const value = Math.min(1, GAME.buttonPress + (1 - GAME.buttonPress) * p);
    return { pressed: true, touched: true, value };
  }

  function remapButtons(buttons, config, heldKeys) {
    const cfg = normalize(config);
    const list = Array.from(buttons ?? []);
    const count = Math.max(list.length, cfg.buttons.length, 16);
    const out = [];
    for (let index = 0; index < count; index += 1) {
      const source = index < cfg.buttons.length ? cfg.buttons[index] : index;
      if (!Number.isInteger(source) || source < 0 || source >= list.length) {
        out.push({ pressed: false, touched: false, value: 0 });
      } else {
        out.push(buttonState(list[source]));
      }
    }
    for (const index of [6, 7]) {
      if (out[index]) out[index] = shapeTrigger(out[index], cfg.triggers.threshold);
    }
    if (heldKeys && cfg.keys.length) {
      for (const key of cfg.keys) {
        if (!heldKeys.has(key.code) || key.button < 0 || key.button >= out.length) continue;
        out[key.button] = { pressed: true, touched: true, value: 1 };
      }
    }
    return out;
  }

  function assignButton(mapping, actionIndex, physicalIndex) {
    const buttons = normalize({ buttons: mapping }).buttons.slice();
    const action = Number(actionIndex);
    const physical = Number(physicalIndex);
    if (!Number.isInteger(action) || action < 0 || action >= buttons.length) return buttons;
    const previous = buttons[action];
    if (Number.isInteger(physical) && physical >= 0) {
      for (let index = 0; index < buttons.length; index += 1) {
        if (index !== action && buttons[index] === physical) buttons[index] = previous;
      }
    }
    buttons[action] = Number.isInteger(physical) && physical >= -1 && physical <= 31 ? physical : previous;
    return buttons;
  }

  function previewLook(x, y, config) {
    const cfg = normalize(config);
    const rawSpeed = Math.hypot(...siteLookVelocity(x, y));
    if (!cfg.enabled) return { rawSpeed, mappedSpeed: rawSpeed, mappedX: x, mappedY: y };
    // The curve describes the look fix, not the stick swap.
    const mapped = remapAxes([0, 0, x, y], { ...cfg, swapSticks: false });
    const mappedSpeed = Math.hypot(...siteLookVelocity(mapped[2], mapped[3]));
    return { rawSpeed, mappedSpeed, mappedX: mapped[2], mappedY: mapped[3] };
  }

  function lookCurve(config, samples = 24) {
    const points = [];
    const steps = Math.max(2, samples);
    for (let i = 0; i <= steps; i += 1) {
      const physical = i / steps;
      points.push({ physical, ...previewLook(physical, 0, config) });
    }
    return points;
  }

  function curveWord(response) {
    if (response < 0.85) return "snappy";
    if (response < 1.2) return "linear";
    if (response < 1.75) return "soft";
    return "like the game";
  }

  root.__velControllerMapper = {
    GAME,
    BUTTONS,
    defaultConfig,
    normalize,
    remapAxes,
    remapButtons,
    assignButton,
    siteLookVelocity,
    siteMoveDirections,
    previewLook,
    lookCurve,
    curveWord,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
