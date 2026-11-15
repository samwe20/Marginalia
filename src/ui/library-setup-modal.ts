export type LibrarySetupModalActions = {
  onChooseFolder: () => void | Promise<void>;
  onCreateFolder: () => void | Promise<void>;
};

let hideCurrent: (() => void) | null = null;

export function isLibrarySetupModalVisible(): boolean {
  const el = document.getElementById("library-setup-modal");
  return !!el && !el.hasAttribute("hidden");
}

export function hideLibrarySetupModal(): void {
  hideCurrent?.();
  hideCurrent = null;
}

/** Blocking first-run dialog until the user sets the library folder. */
export function showLibrarySetupModal(actions: LibrarySetupModalActions): void {
  const host = document.getElementById("app");
  if (!host) return;

  let root = document.getElementById("library-setup-modal");
  if (!root) {
    root = document.createElement("div");
    root.id = "library-setup-modal";
    root.className = "setup-modal";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "setup-modal-title");
    root.innerHTML = `
      <div class="setup-modal__backdrop" aria-hidden="true"></div>
      <div class="setup-modal__panel">
        <h2 id="setup-modal-title">Nastavení knihovny</h2>
        <p class="setup-modal__lead">
          Není nastavena složka pro <strong>knihy</strong> (PDF, EPUB) a pro ukládání <strong>citací a poznámek</strong>.
        </p>
        <p class="muted setup-modal__hint">
          Po výběru složky aplikace automaticky načte všechny knihy, které v ní najde. Teprve potom můžete číst a zvýrazňovat.
        </p>
        <div class="setup-modal__actions">
          <button type="button" class="primary-btn" id="setup-choose-folder">Vybrat složku…</button>
          <button type="button" class="ghost-btn solid" id="setup-create-folder">Vytvořit novou složku</button>
        </div>
      </div>`;
    host.appendChild(root);
  }

  root.removeAttribute("hidden");
  document.body.classList.add("setup-modal-open");

  const chooseBtn = root.querySelector("#setup-choose-folder");
  const createBtn = root.querySelector("#setup-create-folder");
  if (chooseBtn) {
    const fresh = chooseBtn.cloneNode(true);
    chooseBtn.replaceWith(fresh);
    fresh.addEventListener("click", () => void actions.onChooseFolder());
  }
  if (createBtn) {
    const fresh = createBtn.cloneNode(true);
    createBtn.replaceWith(fresh);
    fresh.addEventListener("click", () => void actions.onCreateFolder());
  }

  hideCurrent = () => {
    root!.setAttribute("hidden", "");
    document.body.classList.remove("setup-modal-open");
  };
}