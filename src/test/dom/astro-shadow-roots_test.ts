import {expect, test, vi} from 'vite-plus/test';
import {attachShadowRoots} from '../../lib/astro/shadow-roots.js';

/** A document as `DOMParser` leaves it: shadow roots still templates. */
const parsed = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

test('turns each template into its host shadow root, nested ones too', () => {
  const doc = parsed(
    '<x-outer><template shadowrootmode="open" shadowrootdelegatesfocus>' +
      '<x-inner><template shadowrootmode="open"><b>in</b></template></x-inner>' +
      '</template><p>light</p></x-outer>'
  );
  const outer = doc.querySelector('x-outer')!;
  expect(outer.shadowRoot).toBeNull();

  // happy-dom doesn't report `delegatesFocus` back: read what was asked.
  const attach = vi.spyOn(Element.prototype, 'attachShadow');
  attachShadowRoots(doc);

  expect(attach.mock.calls.map(([init]) => init)).toEqual([
    {mode: 'open', delegatesFocus: true},
    {mode: 'open', delegatesFocus: false},
  ]);
  attach.mockRestore();
  expect(outer.innerHTML).toBe('<p>light</p>');
  const inner = outer.shadowRoot!.querySelector('x-inner')!;
  expect(inner.shadowRoot?.innerHTML).toBe('<b>in</b>');
  expect(inner.innerHTML).toBe('');
});

test('leaves a second template and an unknown mode as they are', () => {
  const doc = parsed(
    '<x-a><template shadowrootmode="open">1</template>' +
      '<template shadowrootmode="open">2</template></x-a>' +
      '<x-b><template shadowrootmode="sideways">3</template></x-b>'
  );
  attachShadowRoots(doc);
  const a = doc.querySelector('x-a')!;
  expect(a.shadowRoot?.textContent).toBe('1');
  expect(a.querySelectorAll('template')).toHaveLength(1);
  expect(doc.querySelector('x-b')!.shadowRoot).toBeNull();
});
