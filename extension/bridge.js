// Isolated world: only this one can reach chrome.storage. The page keeps a copy
// in localStorage, read synchronously on the next load. postMessage and a short
// poll cover both directions, even when a custom event's detail does not cross
// the extension worlds.
(function () {
  if (globalThis.__velControllerMapperBridge) return;
  globalThis.__velControllerMapperBridge = true;

  const KEY = "controller-mapper-config";
  let last = "";
  try {
    last = localStorage.getItem(KEY) || "";
  } catch { last = ""; }

  function pushToStorage(raw) {
    if (!raw || raw === last) return;
    last = raw;
    try {
      chrome.storage.local.set({ [KEY]: JSON.parse(raw) }).catch(() => {});
    } catch { /* invalid json */ }
  }

  function applyFromStorage(config) {
    if (!config || typeof config !== "object") return;
    const raw = JSON.stringify(config);
    if (raw === last) return;
    last = raw;
    try {
      localStorage.setItem(KEY, raw);
    } catch { /* private browsing */ }
    window.postMessage({ source: "cm-bridge", type: "config", config }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "cm-page" || event.data.type !== "save") return;
    try {
      pushToStorage(JSON.stringify(event.data.config));
    } catch { /* incomplete message */ }
  });

  chrome.storage.local.get(KEY).then((data) => {
    let local = "";
    try {
      local = localStorage.getItem(KEY) || "";
    } catch { local = ""; }
    const stored = data?.[KEY] ? JSON.stringify(data[KEY]) : "";
    if (local && local !== stored) pushToStorage(local);
    else if (stored && stored !== local) applyFromStorage(data[KEY]);
    else last = local || stored;
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY]?.newValue) applyFromStorage(changes[KEY].newValue);
  });

  const poll = setInterval(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw && raw !== last) pushToStorage(raw);
    } catch { /* page is closing */ }
  }, 200);
  if (typeof poll.unref === "function") poll.unref();
})();
