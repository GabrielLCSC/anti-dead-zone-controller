import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

function loadRemap() {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(new URL("extension/remap.js", root), "utf8"), context);
  return context.__velControllerMapper;
}

const CM = loadRemap();

function loadHook(pads) {
  const context = vm.createContext({
    console,
    navigator: {
      getGamepads() {
        return pads;
      },
    },
    window: {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      postMessage() {},
    },
    document: {
      readyState: "loading",
      documentElement: {},
      addEventListener() {},
      getElementById() { return null; },
      createElement() { return {}; },
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    location: { origin: "https://vel.gg" },
    setInterval() { return 0; },
    setTimeout() { return 0; },
    clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(new URL("extension/remap.js", root), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("extension/hook.js", root), "utf8"), context);
  return context;
}

test("linear look cancels the site deadzone and square curve", () => {
  const config = CM.defaultConfig();
  const inner = config.look.innerDeadzone;
  for (let i = 0; i <= 20; i += 1) {
    const physical = i / 20;
    const mapped = CM.remapAxes([0, 0, physical, 0], config);
    const speed = Math.hypot(...CM.siteLookVelocity(mapped[2], mapped[3]));
    const p = physical <= inner ? 0 : (physical - inner) / (1 - inner);
    assert.ok(Math.abs(speed - CM.GAME.lookSpeed * p) < 1, `${physical}: ${speed} vs ${CM.GAME.lookSpeed * p}`);
  }
});

test("at 25% the site is almost still, the fix is not, and full deflection is unchanged", () => {
  const config = CM.defaultConfig();
  const quarter = CM.previewLook(0.25, 0, config);
  const full = CM.previewLook(1, 0, config);
  assert.ok(quarter.rawSpeed < 15, quarter.rawSpeed);
  assert.ok(quarter.mappedSpeed > 150, quarter.mappedSpeed);
  assert.ok(Math.abs(full.rawSpeed - CM.GAME.lookSpeed) < 1);
  assert.ok(Math.abs(full.mappedSpeed - CM.GAME.lookSpeed) < 1);
});

test("a resting stick and drift under the threshold do not move look", () => {
  const config = CM.defaultConfig();
  assert.deepEqual([...CM.remapAxes([0, 0, 0, 0], config)].slice(2, 4), [0, 0]);
  const below = [...CM.remapAxes([0, 0, 0.04, -0.02], config)];
  assert.deepEqual(below.slice(2, 4), [0, 0]);
});

test("the original curve keeps the square but not the 18% hole", () => {
  const config = CM.defaultConfig();
  config.look.response = config.look.gameExponent;
  const inner = config.look.innerDeadzone;
  const physical = 0.4;
  const p = (physical - inner) / (1 - inner);
  const mapped = CM.remapAxes([0, 0, physical, 0], config);
  const speed = Math.hypot(...CM.siteLookVelocity(mapped[2], mapped[3]));
  assert.ok(Math.abs(speed - CM.GAME.lookSpeed * p ** 2) < 1, speed);
  assert.equal(Math.hypot(...CM.siteLookVelocity(physical <= 0.18 ? physical : 0.1, 0)), 0);
});

test("the left stick passes through, even if an old setting asked to reshape it", () => {
  const config = CM.defaultConfig();
  config.move = { compensate: true, deadzone: 0.05, invertX: false, invertY: false };
  const mapped = [...CM.remapAxes([0.2, -0.2, 0, 0], config)];
  assert.deepEqual(mapped.slice(0, 2), [0.2, -0.2]);
  assert.deepEqual([...CM.siteMoveDirections(mapped[0], mapped[1])], []);
});

test("turning compensation off leaves a stick unchanged, and swapping sticks moves look", () => {
  const config = CM.defaultConfig();
  config.look.compensate = false;
  assert.deepEqual([...CM.remapAxes([0.2, -0.3, 0.4, 0.1], config)].slice(0, 4), [0.2, -0.3, 0.4, 0.1]);
  config.swapSticks = true;
  config.look.compensate = true;
  const swapped = CM.remapAxes([0.5, 0, 0, 0], config);
  assert.equal(swapped[0], 0);
  assert.ok(Math.abs(swapped[2]) > 0.18);
});

test("buttons swap, triggers arm earlier, and a key covers fire", () => {
  const config = CM.defaultConfig();
  config.buttons = CM.assignButton(config.buttons, 0, 1);
  assert.equal(config.buttons[0], 1);
  assert.equal(config.buttons[1], 0);
  const physical = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
  physical[1] = { pressed: true, touched: true, value: 1 };
  let buttons = CM.remapButtons(physical, config, new Set());
  assert.equal(buttons[0].pressed, true);
  assert.equal(buttons[1].pressed, false);

  config.triggers.threshold = 0.1;
  physical[6] = { pressed: false, touched: true, value: 0.2 };
  buttons = CM.remapButtons(physical, config, new Set());
  assert.equal(buttons[6].pressed, true);
  assert.ok(buttons[6].value >= 0.55);

  config.keys = [{ code: "KeyF", button: 7, swallow: true, label: "F" }];
  buttons = CM.remapButtons(physical, config, new Set(["KeyF"]));
  assert.equal(buttons[7].pressed, true);
  assert.equal(buttons[7].value, 1);
});

test("turning the fix off makes the curve match the site", () => {
  const config = CM.defaultConfig();
  config.enabled = false;
  const preview = CM.previewLook(0.25, 0, config);
  assert.equal(preview.rawSpeed, preview.mappedSpeed);
});

test("the hook replaces getGamepads before the page reads the axes", () => {
  const pad = {
    id: "DualSense",
    index: 0,
    connected: true,
    mapping: "standard",
    timestamp: 1,
    axes: [0.2, 0, 0.25, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  const context = loadHook([pad, null, null, null]);
  const seen = context.navigator.getGamepads();
  assert.equal(seen[0].axes[0], 0.2);
  assert.ok(Math.abs(seen[0].axes[2]) > CM.GAME.lookDeadzone);
  assert.equal(seen[0].mapping, "standard");
  assert.equal(seen[1], null);
  const speed = Math.hypot(...context.__velControllerMapper.siteLookVelocity(seen[0].axes[2], seen[0].axes[3]));
  assert.ok(speed > 150, speed);

  context.__velControllerMapperDebug.setConfig({ ...context.__velControllerMapperDebug.config, enabled: false });
  assert.equal(context.navigator.getGamepads()[0], pad);
});

test("the JavaScript published by vel.gg still has the deadzone this compensates", async () => {
  const response = await fetch("https://vel.gg/bsz/gamepad.js");
  assert.equal(response.ok, true);
  const text = await response.text();
  const start = text.indexOf("const axis =");
  const end = text.indexOf("export class MenuRepeat");
  assert.ok(start > 0 && end > start, "gamepad.js structure changed");
  const body = text.slice(start, end).replace(/^export /gm, "");
  const context = vm.createContext({ console });
  vm.runInContext(`${body}\nthis.api = { lookVelocity, stickDirections };`, context);
  const { lookVelocity, stickDirections } = context.api;

  for (const [x, y] of [[0, 0], [0.1, 0], [0.18, 0], [0.25, -0.1], [0.5, 0.5], [1, 0], [-0.7, 0.2]]) {
    const ours = CM.siteLookVelocity(x, y);
    const theirs = lookVelocity(x, y, {});
    assert.ok(Math.abs(ours[0] - theirs[0]) < 1e-9 && Math.abs(ours[1] - theirs[1]) < 1e-9, `${x},${y}`);
  }

  const config = CM.defaultConfig();
  const inner = config.look.innerDeadzone;
  for (let i = 0; i <= 20; i += 1) {
    const physical = i / 20;
    const mapped = CM.remapAxes([0, 0, physical, 0], config);
    const speed = Math.hypot(...lookVelocity(mapped[2], mapped[3], {}));
    const p = physical <= inner ? 0 : (physical - inner) / (1 - inner);
    assert.ok(Math.abs(speed - 1100 * p) < 1, `site ${physical}: ${speed}`);
  }

  const moved = CM.remapAxes([0.2, 0, 0, 0], config);
  assert.equal(moved[0], 0.2);
  assert.deepEqual([...stickDirections(moved[0], moved[1])], []);
  assert.match(text, /dead = \.18/);
  assert.match(text, /previous\.has\(key\) \? \.25 : \.35/);
});
