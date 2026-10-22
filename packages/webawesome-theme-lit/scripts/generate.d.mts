export interface TokenText {
  base: string;
  dark: string;
  light: string;
}
export function readTokens(): TokenText;
export function definedNames(text: string): Set<string>;
export function renderTokensCss(tokens?: TokenText): string;
export function resolvedValues(tokens?: TokenText): Map<string, string>;
export function renderDesignTokensTs(tokens?: TokenText): string;
export function outputs(): {path: string; text: string}[];
