declare module "pdfjs-dist/build/pdf.mjs" {
  export class TextLayer {
    constructor(options: {
      textContentSource: unknown;
      container: HTMLElement;
      viewport: unknown;
    });
    render(): Promise<void>;
  }
}