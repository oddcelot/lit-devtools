/** lintapple ships no types for its main entry; the part the e2e tests use. */
declare module 'lintapple' {
  import type {Page} from 'playwright-core';

  export interface Finding {
    rule: string;
    selector: string;
    message: string;
  }

  export function checkPage(
    page: Page,
    policy?: Record<string, unknown>
  ): Promise<{findings: Finding[]}>;
}
