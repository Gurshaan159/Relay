let writes = Promise.resolve();
function append(event, tabId) {
  writes = writes
    .then(async () => {
      const s = await chrome.storage.local.get([
        "recording",
        "paused",
        "tabs",
        "events",
      ]);
      if (!s.recording || s.paused || !s.tabs?.includes(tabId)) return;
      await chrome.storage.local.set({
        events: [
          ...(s.events || []),
          { ...event, tab: tabId, timestamp: new Date().toISOString() },
        ].slice(-1000),
      });
    })
    .catch(() => {});
  return writes;
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    const state = await chrome.storage.local.get([
      "recording",
      "paused",
      "events",
      "tabs",
    ]);
    if (message.type === "event") {
      if (
        !state.recording ||
        state.paused ||
        !state.tabs?.includes(sender.tab?.id)
      )
        return;
      const event = message.event;
      if (
        ["password", "hidden", "email", "tel"].includes(event.inputType) ||
        /password|secret|token|verification|otp|credit|card/i.test(
          `${event.name} ${event.label} ${event.autocomplete}`,
        )
      )
        return;
      await append(event, sender.tab.id);
      return { ok: true };
    }
    if (message.type === "status")
      return {
        recording:
          state.recording &&
          !state.paused &&
          state.tabs?.includes(sender.tab?.id),
      };
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
chrome.tabs.onUpdated.addListener(async (id, change, tab) => {
  const state = await chrome.storage.local.get([
    "recording",
    "paused",
    "tabs",
    "events",
  ]);
  if (!state.recording || state.paused || !state.tabs?.includes(id)) return;
  if (change.status === "complete" && tab.url?.startsWith("http")) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: id, allFrames: true },
        files: ["content.js"],
      });
      const url = new URL(tab.url);
      url.search = "";
      url.hash = "";
      await append({ action: "navigate", url: url.href }, id);
    } catch {
      await chrome.storage.local.set({
        warning: "This page or frame cannot be recorded. Add a manual step.",
      });
    }
  }
});
chrome.downloads.onCreated.addListener(async (item) => {
  const s = await chrome.storage.local.get(["recording", "paused", "tabs"]);
  if (!s.recording || s.paused || !item.referrer) return;
  for (const id of s.tabs || []) {
    try {
      const tab = await chrome.tabs.get(id);
      if (
        tab.url &&
        new URL(tab.url).origin === new URL(item.referrer).origin
      ) {
        await append(
          {
            action: "human",
            name: "Verify download and associate it with the triggering click",
            value: "",
          },
          id,
        );
        break;
      }
    } catch {}
  }
});
