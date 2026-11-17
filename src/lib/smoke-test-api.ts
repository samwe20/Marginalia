/** Installed-app smoke: real product paths without weakening assertions (MARGINALIA_SMOKE=1). */

export type SmokeQuoteResult = { quoteId: string; text: string; slug: string };

export type SmokeTestApi = {
  dropBookFromPath: (libraryRoot: string, filePath: string) => Promise<void>;
  createPdfQuoteFromSelection: () => Promise<SmokeQuoteResult>;
  createEpubQuoteFromSelection: () => Promise<SmokeQuoteResult>;
  epubReaderReady: () => boolean;
  epubVisibleTextLength: () => number;
  /** Characters whose rendered boxes intersect the window (not just present in the DOM). */
  epubViewportVisibleTextLength: () => number;
  epubCurrentSectionIndex: () => number | null;
  epubNextSection: () => Promise<number | null>;
  ensureEpubReaderReady: () => Promise<number>;
  epubReaderRenderInfo: () => {
    mode: "iframe" | "fallback" | "empty";
    iframeTextLength: number;
    fallbackTextLength: number;
    visibleTextLength: number;
    viewportVisibleTextLength: number;
    sectionIndex: number | null;
    flow: "paginated" | "scrolled";
    textWidthRatio: number;
    iframeElementInLightDom: boolean;
  };
  epubPointerSelectionRect: () => { x: number; y: number; x2: number; y2: number } | null;
  epubSelectionDiagnostics: () => {
    renderInfo: {
      mode: "iframe" | "fallback" | "empty";
      iframeTextLength: number;
      fallbackTextLength: number;
      visibleTextLength: number;
      iframeElementInLightDom: boolean;
    } | null;
    mode: string;
    route: string;
    selection: {
      selections: { source: string; length: number; preview: string }[];
      mainSelectionLength: number;
      mainSelectionPreview: string;
    };
    lastHighlightKeyAt: number | null;
    highlighterPending: boolean;
  };
  ensureInspectorOpen: () => void;
  verifyDialogPlugin: () => Promise<{ ok: boolean; detail: string }>;
  seedWikilinkBacklink: () => Promise<{ targetTitle: string; backlinkCount: number }>;
  currentBookSlug: () => string | null;
  getLibraryRoot: () => string;
  getFolderPickerInvocationCount: () => number;
  resetFirstRunClientState: () => Promise<void>;
  adoptFixtureLibrary: () => Promise<string>;
  openBookAtPath: (filePath: string, libraryRoot?: string) => Promise<void>;
  finishLibrarySetup: (libraryRoot: string) => Promise<number>;
  rescanBooksFromFolder: () => Promise<{ imported: number; total: number }>;
  countScannedBookCards: () => Promise<number>;
  isSetupModalVisible: () => boolean;
};

declare global {
  interface Window {
    __MARGINALIA_SMOKE_API__?: SmokeTestApi;
  }
}

export function installSmokeTestApi(api: SmokeTestApi): void {
  window.__MARGINALIA_SMOKE_API__ = api;
}

export function getSmokeTestApi(): SmokeTestApi | null {
  return window.__MARGINALIA_SMOKE_API__ ?? null;
}