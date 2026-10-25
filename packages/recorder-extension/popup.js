const $ = (id) => document.getElementById(id);
const endpoint = "http://127.0.0.1:4319";
const show = (message) => ($("status").textContent = message);
const perform = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    show(e.message);
  }
};
async function request(route, body) {
  const { token } = await chrome.storage.local.get("token");
  const r = await fetch(endpoint + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token || ""}`,
    },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error);
  return result;
}
$("pair").onclick = perform(async () => {
  const r = await request("/pair", { code: $("code").value });
  await chrome.storage.local.set({ token: r.token });
  $("code").value = "";
  show("Paired with Relay");
});
$("start").onclick = perform(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url?.startsWith("http"))
    throw Error(
      "Restricted pages cannot be recorded. Open an approved website.",
    );
  const origin = new URL(tab.url).origin + "/*";
  if (!(await chrome.permissions.request({ origins: [origin] })))
    throw Error("Website recording permission was declined");
  const s = await chrome.storage.local.get(["recording", "tabs", "events"]);
  const u = new URL(tab.url);
  u.search = "";
  u.hash = "";
  await chrome.storage.local.set({
    recording: true,
    paused: false,
    tabs: s.recording ? [...new Set([...(s.tabs || []), tab.id])] : [tab.id],
    events: [
      ...(s.recording ? s.events || [] : []),
      {
        action: "navigate",
        url: u.href,
        tab: tab.id,
        timestamp: new Date().toISOString(),
      },
    ],
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ["content.js"],
  });
  show(
    `Recording ${u.host}. Inaccessible cross-origin frames require a manual step.`,
  );
});
$("pause").onclick = perform(async () => {
  const s = await chrome.storage.local.get("paused");
  await chrome.storage.local.set({ paused: !s.paused });
  show(s.paused ? "Recording resumed" : "Recording paused");
});
$("stop").onclick = perform(async () => {
  await chrome.storage.local.set({ recording: false, paused: false });
  const s = await chrome.storage.local.get("events");
  $("events").value = JSON.stringify(s.events || [], null, 2);
  show("Stopped. Review and redact before sending.");
});
$("cancel").onclick = perform(async () => {
  await chrome.storage.local.set({
    recording: false,
    paused: false,
    events: [],
    tabs: [],
  });
  $("events").value = "[]";
  show("Recording cancelled");
});
$("send").onclick = perform(async () => {
  const state = await chrome.storage.local.get("recording");
  if (state.recording) throw Error("Stop recording before sending");
  await request("/recordings", { events: JSON.parse($("events").value) });
  show("Saved in Relay. Choose it in the Demonstrate step.");
});
$("export").onclick = perform(async () => {
  const blob = new Blob(
    [JSON.stringify({ events: JSON.parse($("events").value) }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: "relay-recording.json",
    saveAs: true,
  });
});
chrome.storage.local
  .get(["token", "recording", "paused", "events", "warning"])
  .then((s) => {
    show(
      s.warning ||
        (!s.token
          ? "Not paired"
          : s.recording
            ? s.paused
              ? "Paused"
              : "Recording selected tabs"
            : "Paired · ready"),
    );
    $("events").value = JSON.stringify(s.events || [], null, 2);
  });
