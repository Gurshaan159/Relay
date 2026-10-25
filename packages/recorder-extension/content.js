(() => {
  if (window.__relayRecorder) return;
  window.__relayRecorder = true;
  const sensitive = (el) =>
    ["password", "hidden", "email", "tel"].includes(el.type) ||
    /password|token|secret|verification|otp|cc-|credit|card/i.test(
      [el.name, el.id, el.autocomplete, el.getAttribute("aria-label")].join(
        " ",
      ),
    );
  const descriptor = (el) => {
    const label = el.labels?.[0]?.textContent?.trim();
    const name =
      el.getAttribute("aria-label") ||
      label ||
      el.textContent?.trim().slice(0, 150) ||
      el.getAttribute("placeholder") ||
      "";
    const role =
      el.getAttribute("role") ||
      {
        BUTTON: "button",
        A: "link",
        SELECT: "combobox",
        TEXTAREA: "textbox",
        INPUT: el.type === "checkbox" ? "checkbox" : "textbox",
      }[el.tagName];
    const quote = (s) => String(s).replaceAll('"', '\\"');
    let locator = label
      ? `label=${label}`
      : role && name
        ? `role=${role}[name="${quote(name)}"]`
        : el.id
          ? `css=#${CSS.escape(el.id)}`
          : el.name
            ? `css=[name="${quote(el.name)}"]`
            : "";
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    return {
      name,
      label,
      role,
      locator,
      url: u.href,
      inputType: el.type,
      autocomplete: el.autocomplete,
      frame: window === top ? "top" : location.origin,
      attributes: {
        id: el.id,
        name: el.name,
        "data-testid": el.dataset.testid,
      },
      candidates: [locator],
    };
  };
  const send = async (action, el, value = "") => {
    if (
      !(el instanceof Element) ||
      sensitive(el) ||
      el.closest("[data-relay-recorder]")
    )
      return;
    const status = await chrome.runtime.sendMessage({ type: "status" });
    if (!status?.recording) return;
    chrome.runtime.sendMessage({
      type: "event",
      event: { action, ...descriptor(el), value },
    });
  };
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest(
        "button,a,input[type=checkbox],[role=button]",
      );
      if (el) send("click", el);
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      const el = e.target;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
        send(
          el.type === "file"
            ? "upload"
            : el.tagName === "SELECT"
              ? "select"
              : "fill",
          el,
          el.type === "file" ? "" : el.value,
        );
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (["Enter", "Escape"].includes(e.key)) send("press", e.target, e.key);
    },
    true,
  );
  const badge = document.createElement("div");
  badge.dataset.relayRecorder = "true";
  badge.textContent = "Relay · recording this tab";
  Object.assign(badge.style, {
    position: "fixed",
    bottom: "18px",
    right: "18px",
    padding: "10px 16px",
    background: "#117780",
    color: "white",
    borderRadius: "24px",
    font: "13px system-ui",
    zIndex: 2147483647,
    pointerEvents: "none",
  });
  document.documentElement.append(badge);
  setInterval(async () => {
    try {
      const state = await chrome.runtime.sendMessage({ type: "status" });
      badge.style.display = state?.recording ? "block" : "none";
    } catch {
      badge.remove();
    }
  }, 1000);
})();
