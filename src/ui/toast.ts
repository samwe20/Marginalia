export function mountToastRegion(
  root: HTMLElement,
): (message: string, kind?: "info" | "error" | "success") => void {
  const region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("aria-live", "polite");
  root.appendChild(region);

  let lastKey = "";
  let lastAt = 0;

  return (message, kind = "info") => {
    const key = `${kind}:${message}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < 1800) return;
    lastKey = key;
    lastAt = now;

    region.querySelectorAll(`.toast--${kind}`).forEach((el) => {
      if (el.textContent === message) el.remove();
    });

    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    region.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast--in"));
    window.setTimeout(() => {
      toast.classList.remove("toast--in");
      toast.classList.add("toast--out");
      window.setTimeout(() => toast.remove(), 220);
    }, kind === "success" ? 2400 : 3600);
  };
}
