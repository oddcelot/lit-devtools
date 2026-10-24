import type {
  InspectorFormValue,
  InspectorInternals,
} from '../types/inspector.js';

/** A row of the Internals section: what it is and its value as text. */
export interface InternalsRow {
  name: string;
  value: string;
  /** Whether the value reads as code (a string, a File, …), not as prose. */
  code: boolean;
}

const sizeText = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} kB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** A form value as one line: a quoted string, `File(…)`, `FormData {…}`. */
export const formValueText = (v: InspectorFormValue): string => {
  switch (v.type) {
    case 'null':
      return 'null';
    case 'string':
      return JSON.stringify(v.value);
    case 'file':
      return `File(${JSON.stringify(v.name)}, ${sizeText(v.size)}${v.mime === '' ? '' : `, ${v.mime}`})`;
    case 'form-data': {
      const entries = v.entries.map(
        (e) => `${JSON.stringify(e.name)}: ${formValueText(e.value)}`
      );
      if (v.more !== undefined) entries.push(`… ${v.more} more`);
      return `FormData {${entries.join(', ')}}`;
    }
  }
};

/**
 * The rows the Internals section lists, in order: custom states, the form
 * value and its state, validity and the validation message. Rows with
 * nothing to say are left out, except the states.
 */
export const internalsRows = (i: InspectorInternals): InternalsRow[] => {
  const rows: InternalsRow[] = [
    {
      name: 'states',
      value: i.states.length === 0 ? 'none' : i.states.join(', '),
      code: false,
    },
  ];
  if (i.value !== undefined) {
    rows.push({name: 'value', value: formValueText(i.value), code: true});
  }
  if (i.state !== undefined) {
    rows.push({name: 'state', value: formValueText(i.state), code: true});
  }
  if (i.validity !== undefined) {
    const {valid, flags, message} = i.validity;
    rows.push({
      name: 'validity',
      value: valid ? 'valid' : flags.join(', ') || 'invalid',
      code: false,
    });
    if (message !== '') {
      rows.push({
        name: 'validationMessage',
        value: JSON.stringify(message),
        code: true,
      });
    }
  }
  return rows;
};
