/**
 * The extension's DevTools page: Chrome loads it, hidden, each time DevTools
 * opens. It adds the Lit tab, and a Lit tab to the Elements panel's sidebar
 * beside Styles and Computed: the same page in details-only mode, following
 * the Elements selection (see `panel.ts`).
 */

void chrome.devtools.panels.create('Lit', 'icon.svg', 'panel.html');
chrome.devtools.panels.elements.createSidebarPane('Lit', (pane) => {
  pane.setPage('panel.html?view=sidebar');
});
