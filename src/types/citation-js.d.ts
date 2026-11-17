declare module "@citation-js/core" {
  export default class Cite {
    constructor(data: unknown);
    format(
      mode: string,
      opts?: Record<string, unknown>,
    ): string | string[];
  }
}

declare module "@citation-js/plugin-csl";