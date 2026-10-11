import {render} from 'lit';
import {afterEach, beforeEach, expect, test} from 'vite-plus/test';
import {renderDocInline, renderDocText} from '../../panel/doc-text.js';

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => host.remove());

const html = (template: unknown) => {
  render(template, host);
  return host.innerHTML.replace(/<!--.*?-->/g, '').replace(/>\s+</g, '><');
};

test('renders blocks and inline markup as elements', () => {
  expect(
    html(
      renderDocText(
        'Hello **bold** and `code`,\nsoft wrapped.\n\n- a\n- b\n\n```\nx < y\n```'
      )
    )
  ).toBe(
    '<p>Hello <strong>bold</strong> and <code>code</code>, soft wrapped.</p>' +
      '<ul><li>a</li><li>b</li></ul><pre><code>x &lt; y</code></pre>'
  );
});

test('renders a heading as a bold paragraph, an ordered list with its start', () => {
  expect(html(renderDocText('# Title\n\n2. x'))).toBe(
    '<p><strong>Title</strong></p><ol start="2"><li>x</li></ol>'
  );
});

test('only http(s) links become anchors, opening safely', () => {
  render(
    renderDocText('[ok](https://x.dev) [bad](javascript:alert(1)) {@link Foo}'),
    host
  );
  const links = [...host.querySelectorAll('a')];
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://x.dev/']);
  expect(links[0]!.getAttribute('target')).toBe('_blank');
  expect(links[0]!.getAttribute('rel')).toBe('noopener noreferrer');
  expect(host.querySelector('code')!.textContent).toBe('Foo');
  expect(host.textContent).toContain('bad');
});

test('markup in the source stays text', () => {
  render(renderDocText('<img src=x onerror=alert(1)> <b>hi</b>'), host);
  expect(host.querySelector('img, b')).toBeNull();
  expect(host.textContent).toBe('<img src=x onerror=alert(1)> <b>hi</b>');
});

test('mark wraps every text run, code included, but not the markup', () => {
  const runs: string[] = [];
  render(
    renderDocText('a **b** `c`\n\n```\nd\n```', (t) => {
      runs.push(t);
      return t;
    }),
    host
  );
  expect(runs).toEqual(['a ', 'b', ' ', 'c', 'd']);
});

test('inline rendering unwraps a lone paragraph only', () => {
  expect(html(renderDocInline('One\nline `x`.'))).toBe(
    'One line <code>x</code>.'
  );
  expect(html(renderDocInline('A\n\nB'))).toBe('<p>A</p><p>B</p>');
});
