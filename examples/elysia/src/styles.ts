/**
 * Styles for the document itself. Components style their own shadow roots;
 * the custom properties here reach into them.
 */
export const documentStyles = `
  :root {
    --paper: #fbf7ef;
    --card: #fffdf9;
    --ink: #2b2622;
    --muted: #7a6f66;
    --line: #e7dfd2;
    --accent: #324fff;
    --live: #1f9d55;
    --warn: #c2410c;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
    --sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
    color-scheme: light;
  }
  * {
    box-sizing: border-box;
  }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 16px/1.5 var(--sans);
  }
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 3rem 1.25rem 4rem;
    display: grid;
    gap: 2rem;
  }
  #masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 1rem;
  }
  #masthead h1 {
    margin: 0;
    font: 600 2.5rem/1 var(--serif);
    letter-spacing: -0.01em;
  }
  #masthead p {
    margin: 0.4rem 0 0;
    color: var(--muted);
  }
  footer {
    color: var(--muted);
    font-size: 0.85rem;
    text-align: center;
  }
  footer a {
    color: inherit;
  }
`;
