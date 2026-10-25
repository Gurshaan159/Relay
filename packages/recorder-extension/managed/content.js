(() => {
  let state = { status: "starting", approved: false, count: 0 };
  const call = (message) => chrome.runtime.sendMessage(message);
  const sensitive = (el) => {
    const details = [
      el.type,
      el.name,
      el.id,
      el.autocomplete,
      el.getAttribute("aria-label"),
      ...(el.labels || []),
    ]
      .filter((x) => x != null)
      .map((x) => (typeof x === "string" ? x : x.textContent))
      .join(" ");
    return (
      /password|hidden|email|tel|token|secret|verification|one.time|otp|credit|card|cvc|cvv|auth|passcode|security.code/i.test(
        details,
      ) || !!el.closest("[data-relay-private]")
    );
  };
  function describe(el) {
    const label = el.labels?.[0]?.textContent?.trim() || "";
    const name = (
      el.getAttribute("aria-label") ||
      label ||
      el.innerText ||
      el.getAttribute("title") ||
      ""
    )
      .trim()
      .slice(0, 200);
    const role =
      el.getAttribute("role") ||
      { BUTTON: "button", A: "link", SELECT: "combobox", TEXTAREA: "textbox" }[
        el.tagName
      ] ||
      (el.tagName === "INPUT" ? "textbox" : "");
    const candidates = [];
    if (label) candidates.push(`label=${label}`);
    if (role && name && !name.includes('"'))
      candidates.push(`role=${role}[name="${name}"]`);
    if (el.getAttribute("data-testid"))
      candidates.push(
        `css=[data-testid="${CSS.escape(el.getAttribute("data-testid"))}"]`,
      );
    if (el.id) candidates.push(`css=#${CSS.escape(el.id)}`);
    if (el.name) candidates.push(`css=[name="${CSS.escape(el.name)}"]`);
    return {
      name,
      role,
      label,
      candidates,
      locator: candidates[0] || "",
      inputType: el.type,
      autocomplete: el.autocomplete,
      attributes: {
        id: el.id,
        name: el.name,
        testId: el.getAttribute("data-testid"),
      },
    };
  }
  function capture(event) {
    if (!event.isTrusted || state.status !== "recording" || !state.approved)
      return;
    const el = event.target.closest?.(
      "input,textarea,select,button,a,[role], [data-testid]",
    );
    if (!el || sensitive(el) || el.closest("#relay-recorder-toolbar")) return;
    let action,
      value = "";
    if (event.type === "change") {
      action =
        el.type === "file"
          ? "upload"
          : el.tagName === "SELECT"
            ? "select"
            : "fill";
      value = el.type === "file" ? "" : el.value;
    } else if (event.type === "keydown") {
      if (event.key !== "Enter") return;
      action = "press";
      value = "Enter";
    } else {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      action = "click";
    }
    call({
      type: "event",
      event: { ...describe(el), action, value, timestamp: Date.now() },
    }).catch(() => {});
  }
  for (const type of ["click", "change", "keydown"])
    document.addEventListener(type, capture, true);
  let label, pause, root;
  function mount() {
    if (window !== window.top || !document.documentElement || root?.isConnected)
      return;
    root = document.createElement("div");
    root.id = "relay-recorder-toolbar";
    root.style.cssText =
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647";
    const shadow = root.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{all:initial}div{display:flex;align-items:center;gap:10px;padding:12px 16px;background:white;color:#173c3b;box-shadow:0 3px 24px #0003;border:1px solid #dce5e4;border-radius:14px;font:14px system-ui}button{font:inherit;padding:7px 12px;border:1px solid #cad8d6;border-radius:7px;background:white;color:#173c3b;cursor:pointer}button:focus-visible{outline:3px solid #10988b}button.primary{background:#087f73;color:white;border-color:#087f73}span{min-width:140px}</style><div role="region" aria-label="Relay recording"><strong>Relay</strong><span></span><button>Pause</button><button class="primary">Finish</button><button>Cancel</button></div>`;
    label = shadow.querySelector("span");
    const buttons = shadow.querySelectorAll("button");
    pause = buttons[0];
    ["pause", "finish", "cancel"].forEach((action, i) =>
      buttons[i].addEventListener("click", async (event) => {
        if (!event.isTrusted) return;
        if (
          action === "cancel" &&
          state.count &&
          !window.confirm(
            "Discard this demonstration? Your recorded actions will be lost.",
          )
        )
          return;
        try {
          state = {
            ...state,
            ...(await call({
              type: "control",
              action:
                action === "pause" && state.status === "paused"
                  ? "resume"
                  : action,
              confirm: true,
            })),
          };
          render();
        } catch {
          label.textContent = "Return to Relay to retry";
        }
      }),
    );
    document.documentElement.append(root);
    render();
  }
  function render() {
    if (!label) return;
    label.textContent =
      state.status === "error"
        ? "Return to Relay to retry"
        : !state.approved
          ? "This site isn’t recorded"
          : `${state.status === "paused" ? "Paused" : "Recording"} · ${state.count} actions`;
    pause.textContent = state.status === "paused" ? "Resume" : "Pause";
  }
  async function refresh() {
    try {
      state = await call({ type: "state" });
      mount();
      render();
    } catch {}
  }
  void refresh();
  setInterval(refresh, 700);
})();
