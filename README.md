# BO1 Controller Fix

Controller fix for [BO1 Zombies on vel.gg](https://vel.gg/bsz). It lowers the look deadzone and lets you rebind buttons. The left stick is not modified.

macOS has no deadzone setting for the DualSense, and Steam’s setting does nothing here: the site reads the controller itself, in `gamepad.js`, then turns the sticks into mouse movement and keys.

The right stick is ignored below 18% deflection, then speed follows the square of what remains. At 25% stick, about 8 px/s of 1100 is left. The extension rewrites that stick before this read. At full deflection, look speed stays the site’s. The left stick is copied through unchanged.

## Install

1. Open `chrome://extensions` in the Chrome that launches the game (including when Steam starts it).
2. Turn on developer mode.
3. “Load unpacked” and choose the `extension` folder.
4. Reload the `https://vel.gg/bsz` tab.

A **Controller** button appears at the top right. Click it to open the panel, then Close to dismiss it. The extension icon also rebinds buttons.

Leave the Steam controller config on raw values. A Steam curve on top of this one would stack.

## Tuning

- **Look deadzone**: set it just above the deflection shown when you are not touching the stick. Below that, the camera drifts, because the fix amplifies small movements.
- **Linear curve**: look speed follows the stick. “Like the game” only removes the 18% hole and keeps the square. At full deflection, speed stays the site’s. If it feels too fast, lower sensitivity in the controller menu already on the site.
- **Buttons**: each action picks the physical button that triggers it. Two swapped buttons exchange places.
- **Key → button**: the key is seen as that button. “Block” stops it from also arriving as a keyboard key.

If a site update makes look sluggish again, the advanced settings “deadzone hardcoded in the game” and “exponent hardcoded in the game” are the site’s two numbers (18% and 2 today).

## Preview without the game

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/demo/` and `http://127.0.0.1:8765/extension/popup.html`.

```bash
node --test test/remap.test.mjs
```

The test fetches `gamepad.js` from vel.gg and checks that the fix still cancels its formula.
