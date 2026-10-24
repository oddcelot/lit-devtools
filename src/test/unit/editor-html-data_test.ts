import {expect, test} from 'vite-plus/test';
import {createHtmlDocs} from '../../lib/editor/html-data.js';

const html = createHtmlDocs({
  tags: [
    {
      name: 'button',
      description: {kind: 'markdown', value: 'A button.'},
      attributes: [
        {name: 'disabled', valueSet: 'v'},
        {name: 'type', valueSet: 'bt', description: 'What it does.'},
        {name: 'popovertarget'},
      ],
      references: [
        {name: 'MDN Reference', url: 'https://developer.mozilla.org/b'},
      ],
    },
  ],
  globalAttributes: [
    {name: 'id', description: 'Unique.'},
    {name: 'dir', values: [{name: 'ltr'}, {name: 'rtl'}]},
    {name: 'onclick', description: 'A click.'},
  ],
  valueSets: [{name: 'bt', values: [{name: 'button'}, {name: 'submit'}]}],
});

test('an element with its attributes, value sets and reference links', () => {
  expect(html.get('button')).toMatchObject({
    tagName: 'button',
    description:
      'A button.\n\n[MDN Reference](https://developer.mozilla.org/b)',
    attributes: [
      {name: 'disabled', type: 'boolean'},
      {name: 'type', type: "'button' | 'submit'", description: 'What it does.'},
      {name: 'popovertarget'},
    ],
  });
  expect(html.get('x-nope')).toBeNull();
  expect(html.tags()).toEqual(['button']);
});

test('global attributes, and on… handlers as DOM events', () => {
  expect(html.globals).toEqual({
    attributes: [
      {name: 'id', description: 'Unique.'},
      {name: 'dir', type: "'ltr' | 'rtl'"},
    ],
    events: [{name: 'click', description: 'A click.', type: 'MouseEvent'}],
  });
});
