declare module "foliate-js/view.js" {
  export function makeBook(file: Blob): Promise<unknown>;
}

declare module "foliate-js/overlayer.js" {
  export class Overlayer {
    static highlight(
      rects: { left: number; top: number; width: number; height: number }[],
      options?: { color?: string; padding?: number },
    ): SVGGElement;
  }
}