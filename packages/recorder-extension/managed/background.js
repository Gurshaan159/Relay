// Only this isolated extension worker holds the session capability.
let chain = Promise.resolve();
async function config() {
  return (await chrome.storage.local.get("session")).session;
}
async function send(body) {
  const c = await config();
  if (!c) return { status: "starting", count: 0 };
  const r = await fetch(c.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw Error("Recorder disconnected");
  return r.json();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) return false;
  chain = chain
    .catch(() => {})
    .then(async () => {
      const c = await config();
      const url = sender.url || sender.tab.url;
      const approved = c && c.origins.includes(new URL(url).origin);
      if (message.type === "event" && approved) {
        return send({
          type: "event",
          event: {
            ...message.event,
            url,
            tab: sender.tab.id,
            frame: sender.frameId ? url : "",
            frameId: sender.frameId,
          },
        });
      }
      if (message.type === "control" && sender.frameId === 0)
        return send({
          type: message.action,
          confirm: message.confirm === true,
        });
      const state = await send({ type: "state" });
      return { ...state, approved: !!approved };
    });
  chain.then(respond, () =>
    respond({
      status: "error",
      error: "Recording disconnected. Return to Relay and retry.",
    }),
  );
  return true;
});
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  chain = chain
    .catch(() => {})
    .then(async () => {
      const c = await config();
      if (c?.origins.includes(new URL(details.url).origin))
        await send({
          type: "event",
          event: {
            action: "navigate",
            url: details.url,
            tab: details.tabId,
            timestamp: Date.now(),
          },
        });
    });
});
chrome.downloads.onCreated.addListener((item) => {
  chain = chain
    .catch(() => {})
    .then(async () => {
      const c = await config();
      if (
        c &&
        item.referrer &&
        c.origins.includes(new URL(item.referrer).origin)
      )
        await send({
          type: "event",
          event: {
            action: "download",
            url: item.referrer,
            name: "Downloaded file",
            timestamp: Date.now(),
          },
        });
    });
});
