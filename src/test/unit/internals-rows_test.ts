import {expect, test} from 'vite-plus/test';
import {formValueText, internalsRows} from '../../panel/internals-rows.js';

test('writes each kind of form value on one line', () => {
  expect(formValueText({type: 'null'})).toBe('null');
  expect(formValueText({type: 'string', value: 'a "b"'})).toBe('"a \\"b\\""');
  expect(
    formValueText({type: 'file', name: 'a.png', size: 2048, mime: 'image/png'})
  ).toBe('File("a.png", 2.0 kB, image/png)');
  expect(
    formValueText({
      type: 'form-data',
      entries: [
        {name: 'tag', value: {type: 'string', value: 'x'}},
        {name: 'doc', value: {type: 'file', name: 'b', size: 3, mime: ''}},
      ],
      more: 2,
    })
  ).toBe('FormData {"tag": "x", "doc": File("b", 3 B), … 2 more}');
});

test('lists states always and the rest only when there is something to say', () => {
  expect(internalsRows({states: []})).toEqual([
    {name: 'states', value: 'none', code: false},
  ]);
  expect(
    internalsRows({
      states: ['on'],
      value: {type: 'string', value: '1'},
      state: {type: 'string', value: 'checked'},
      validity: {valid: true, flags: [], message: ''},
    }).map((r) => [r.name, r.value])
  ).toEqual([
    ['states', 'on'],
    ['value', '"1"'],
    ['state', '"checked"'],
    ['validity', 'valid'],
  ]);
});
