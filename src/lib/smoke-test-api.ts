/** Installed-app smoke: real product paths without weakening assertions (MARGINALIA_SMOKE=1). */

export type SmokeQuoteResult = { quoteId: string; text: string; slug: string };

export type SmokeTestApi = {
  dropBookFromPath: (libraryRoot: string, filePath: string) => Promise<void>;
  createPdfQuoteFromSelection: () => Promise<SmokeQuoteResult>;
  createEpubQuoteFromSelection: () => Promise<SmokeQuoteResult>;
  epubReaderReady: () => boolean;
  epubVisibleTextLength: () => number;
  ensureEpubReaderReady: () => Promise<number>;
  epubPointerSelectionRect: () => { x: number; y: number; x2: number; y2: number } | null;
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