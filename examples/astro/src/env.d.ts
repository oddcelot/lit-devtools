declare module 'astro' {
  interface AstroClientDirectives {
    /** Hydrate the island when the element the selector names is clicked. */
    'client:on'?: string;
  }
}
export {};
