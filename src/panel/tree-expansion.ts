/**
 * Whether the Components tree opens every node instead of starting
 * collapsed. A page that hosts the panel sets it before the panel mounts;
 * the docs' live demos do (`figures/live/panel-page.ts`, `?expand=all`).
 */
let expandAll = false;

export const expandTreeByDefault = (): void => {
  expandAll = true;
};

export const treeStartsExpanded = (): boolean => expandAll;
