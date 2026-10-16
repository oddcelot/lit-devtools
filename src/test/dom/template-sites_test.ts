import {beforeAll, expect, test} from 'vite-plus/test';
import {
  installTemplateSites,
  templateSiteOf,
} from '../../lib/runtime/template-sites.js';

type Lit = typeof import('lit');
let lit: Lit;

// lit-html reports its templates only to a hook set before it loads, so
// lit is imported after the install, never statically.
beforeAll(async () => {
  installTemplateSites();
  lit = await import('lit');
});

let n = 0;
// Templates are tagged `h`, not `html`, so the formatter leaves their text
// (what the assertions compare) exactly as written.
const define = (render: (l: Lit & {h: Lit['html']}) => unknown): string => {
  const tag = `x-tpl-${n++}`;
  customElements.define(
    tag,
    class extends lit.LitElement {
      override render() {
        return render({...lit, h: lit.html});
      }
    }
  );
  return tag;
};

const mount = async (tag: string) => {
  const el = document.createElement(tag) as InstanceType<Lit['LitElement']>;
  document.body.append(el);
  await el.updateComplete;
  return el;
};

test('names the template, tag and position of an element its host rendered', async () => {
  const plain = define(({h}) => h`<b>${1}</b><x-ia></x-ia><x-ia></x-ia>`);
  const el = await mount(plain);
  const second = el.shadowRoot!.querySelectorAll('x-ia')[1]!;
  expect(templateSiteOf(second)).toEqual({
    strings: ['<b>', '</b><x-ia></x-ia><x-ia></x-ia>'],
    tag: 'x-ia',
    index: 1,
    scripts: [],
  });
});

test('skips what a child part holds, and finds elements in nested templates', async () => {
  const el = await mount(
    define(
      ({h}) =>
        h`<x-item-b></x-item-b>${[1, 2].map(
          (i) => h`<li><x-item-b data-i=${i}></x-item-b></li>`
        )}<x-item-b></x-item-b>`
    )
  );
  const items = [...el.shadowRoot!.querySelectorAll('x-item-b')];
  expect(items).toHaveLength(4);
  // The host template's second x-item-b is the last one on the page: the
  // two in between came from the inner template.
  expect(templateSiteOf(items[3]!)).toMatchObject({index: 1});
  expect(templateSiteOf(items[2]!)).toMatchObject({
    strings: ['<li><x-item-b data-i=', '></x-item-b></li>'],
    index: 0,
  });
});

test('has nothing for an element no template made', async () => {
  const el = await mount(define(() => lit.nothing));
  const made = document.createElement('x-item-c');
  el.shadowRoot!.append(made);
  expect(templateSiteOf(made)).toBeUndefined();
});
