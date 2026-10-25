import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/** Each status a table cell can open with, and the tone it renders in. */
const STATUSES = {
  yes: 'yes',
  shown: 'yes',
  partial: 'partial',
  'partly shown': 'partial',
  no: 'no',
  'not shown': 'no',
};
/** Phosphor (MIT) fill icons, one per tone. */
const ICON_FILES = {
  yes: 'check-circle',
  partial: 'circle-half',
  no: 'x-circle',
};
const ICONS = Object.fromEntries(
  Object.entries(ICON_FILES).map(([tone, name]) => [
    tone,
    readFileSync(
      require.resolve(`@phosphor-icons/core/assets/fill/${name}-fill.svg`),
      'utf8'
    ).replace('<svg ', '<svg aria-hidden="true" width="18" height="18" '),
  ])
);

// Longest first, so "not shown" wins over "no".
const STATUS = new RegExp(
  `^(${Object.keys(STATUSES)
    .sort((a, b) => b.length - a.length)
    .join('|')})(?=$|[\\s,;.(])`,
  'i'
);

/**
 * Turns the yes / no / partly cells of every docs table into a coloured
 * icon, so a feature matrix reads at a glance. The Markdown keeps the plain
 * word: a cell that is only the word shows the icon and keeps the word for
 * screen readers; a cell that says more ("Yes, literal names only") keeps
 * its text after the icon. The first cell of a row is its label and is left
 * alone.
 */
const statusCellsPlugin = {
  name: 'status-cells',
  element: {
    filter: ['td'],
    visit(cell, ctx) {
      const index = ctx.indexOf(cell) ?? 0;
      const siblings = ctx.parent(cell).children.slice(0, index);
      if (!siblings.some((node) => node.type === 'element')) return;

      const text = ctx.textContent(cell).trim();
      const [, word] = text.match(STATUS) ?? [];
      if (!word) return;
      const tone = STATUSES[word.toLowerCase()];
      const icon = {type: 'raw', value: ICONS[tone]};
      const only = text.length === word.length;
      ctx.setProperty(cell, 'className', [
        'status-cell',
        `status-${tone}`,
        ...(only ? ['status-only'] : []),
      ]);
      if (!only) {
        ctx.prependChild(cell, icon);
        return;
      }
      for (let i = cell.children.length - 1; i >= 0; i--) {
        ctx.removeChildAt(cell, i);
      }
      ctx.appendChild(cell, [
        icon,
        {
          type: 'element',
          tagName: 'span',
          properties: {className: ['sr-only']},
          children: [{type: 'text', value: text}],
        },
      ]);
    },
  },
};

/** Adds the plugin to the site's Sätteri Markdown processor. */
export const statusCells = () => ({
  name: 'status-cells',
  hooks: {
    'astro:config:setup': ({config}) => {
      config.markdown.processor.options.hastPlugins.push(statusCellsPlugin);
    },
  },
});
