export type ToastKind = "info" | "error" | "success";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  kind?: ToastKind;
  /** Keep toast visible this long (ms). Default depends on kind. */
  durationMs?: number;
  action?: ToastAction;
};

export type ShowToast = (message: string, kindOrOpts?: ToastKind | ToastOptions) => void;

export function mountToastRegion(root: HTMLElement): ShowToast {
  const region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("aria-live", "polite");
  root.appendChild(region);

  let lastKey = "";
  let lastAt = 0;

  return (message, kindOrOpts = "info") => {
    const opts: ToastOptions =
      typeof kindOrOpts === "string" ? { kind: kindOrOpts } : kindOrOpts ?? {};
    const kind = opts.kind ?? "info";
    const key = `${kind}:${message}:${opts.action?.label ?? ""}`;
    const now = Date.now();
    if (!opts.action && key === lastKey && now - lastAt < 1800) return;
    lastKey = key;
    lastAt = now;

    region.querySelectorAll(`.toast--${kind}`).forEach((el) => {
      if ((el as HTMLElement).dataset.toastMsg === message) el.remove();
    });

    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.dataset.toastMsg = message;
    toast.setAttribute("role", "status");

    const text = document.createElement("span");
    text.className = "toast__msg";
    text.textContent = message;
    toast.appendChild(text);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      toast.classList.remove("toast--in");
      toast.classList.add("toast--out");
      window.setTimeout(() => toast.remove(), 220);
    };

    if (opts.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast__action";
      btn.textContent = opts.action.label;
      btn.addEventListener("click", () => {
        opts.action!.onClick();
        close();
      });
      toast.appendChild(btn);
    }

    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast--in"));
    const duration =
      opts.durationMs ?? (opts.action ? 5000 : kind === "success" ? 2400 : 3600);
    window.setTimeout(close, duration);
  };
}
