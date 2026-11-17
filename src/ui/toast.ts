export function mountToastRegion(root: HTMLElement): (message: string, kind?: "info" | "error" | "success") => void {
  const region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("aria-live", "polite");
  root.appendChild(region);

  return (message, kind = "info") => {
    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.textContent = message;
    region.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4200);
  };
}