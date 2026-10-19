# Forms

Form-associated custom elements in Lit. A text field, a switch and a star
rating each take part in a plain `<form>` the way native controls do: they
go into `FormData`, block submit while invalid, reset with the form and
follow a disabled `<fieldset>`. What each one is doing is exposed as custom
states, which CSS reads with `:state()`. Rules that span fields are a
[valibot](https://valibot.dev) schema.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/oddcelot/vite-plugin-lit/tree/main/examples/forms?file=src/form-control.ts)

The files in `src/`:

- **`form-control.ts`** is `FormControl`, the base class the three controls
  extend. It holds the `ElementInternals` and does the form plumbing; a
  subclass only says what it submits, how to take a value back and what makes
  it invalid.
- **`<fm-text-field>`** wraps an `<input>` and passes the input's own
  validity on to the form, so `required`, `type="email"` and `minlength` give
  the browser's messages.
- **`<fm-switch>`** has no `<input>` at all. The host is the control, with
  the `switch` role set through `ElementInternals`.
- **`<fm-rating>`** is a `slider` with arrow-key support and a validity rule
  of its own.
- **`feedback-schema.ts`** is the valibot schema for the rules that span
  fields.
- **`<fm-feedback>`** is the page: the form, the schema run after every
  change, and a table of every control's states.

## Try it

Run it (on StackBlitz this has already happened):

```sh
npm install
npm run dev
```

Then:

1. **Press Send with the form empty.** Submit is blocked and the browser
   points at the first invalid control, as it would for an `<input>`. Every
   invalid control turns `user-invalid`, so their errors and the summary at
   the top appear at once.
2. **Fill it in and send.** The `FormData` the form built is printed below
   it. The newsletter switch adds `newsletter: on` only while it is on, like a
   checkbox.
3. **Turn the newsletter on, or give one or two stars.** Email is optional
   until the newsletter is on, and the comment until the rating is low. The
   field that now needs filling in turns invalid with valibot's message, and
   submit is blocked until it is filled.
4. **Click a label.** "Send me the newsletter" toggles its switch: an outside
   `<label for>` names a form-associated element and clicking it clicks the
   control.
5. **Tick "Disable the fieldset".** Every control matches `:disabled` and
   drops out of `FormData`. Then press **Reset**: values, states and the
   checkbox go back to where they started.
6. **Edit a control while the form is filled in.** Change the track colour in
   `src/fm-switch.ts`: the switch restyles in place and stays on. Or change
   the heading in `src/fm-feedback.ts`: the plugin re-creates the controls
   inside that template, and carries their values over along with the
   `#private` field that remembers where each one started, so the dirty dots
   stay and Reset still clears.

## The base class

`FormControl` turns on `static formAssociated = true` and calls
`attachInternals()`. A subclass implements two methods, and a third if it
validates:

```ts
@customElement('fm-switch')
export class FmSwitch extends FormControl {
  @property({type: Boolean}) checked = false;
  @property() value = 'on';

  // What FormData gets under `name`; null leaves it out.
  protected formValue() {
    return this.checked ? this.value : null;
  }

  // Takes back what formValue() returned, on reset and on restore.
  protected restore(value: string | null) {
    this.checked = value !== null;
  }

  // Empty means valid.
  protected override validate() {
    return this.required && !this.checked
      ? {flags: {valueMissing: true}, message: 'Switch this on to continue.'}
      : {};
  }
}
```

After every update, the base class passes the value to `setFormValue()` and
the validity to `setValidity()`. It also implements the form callbacks:

| Callback                   | When                                 | What it does                            |
| -------------------------- | ------------------------------------ | --------------------------------------- |
| `formResetCallback`        | the form resets                      | restores the first value, clears states |
| `formDisabledCallback`     | `disabled` or a `<fieldset>` changes | keeps `isDisabled` current              |
| `formStateRestoreCallback` | back/forward navigation, autofill    | restores the saved value                |

It also gives the controls the `form`, `labels`, `validity`,
`validationMessage`, `willValidate`, `checkValidity()` and
`reportValidity()` that native controls have, plus `name`, `disabled` and
`required` properties, and `setCustomValidity()` for errors from outside.

## Rules across fields, with valibot

A control can only check itself. "Email is required once the newsletter is
on" is about two fields, so it lives in `feedback-schema.ts`, a valibot
schema over the form's `FormData`. Each rule is a `partialCheck` on the
fields it reads, and `forward` files its issue under the field to blame:

```ts
v.forward(
  v.partialCheck(
    [['newsletter'], ['email']],
    ({newsletter, email}) => newsletter === undefined || email !== '',
    'Add an email for the newsletter to go to.'
  ),
  ['email']
);
```

After every `input` and `change`, `<fm-feedback>` waits for the controls'
`updateComplete` (they put their values into the form when they update),
runs the schema with `safeParse`, flattens the issues by field and calls each
control's `setCustomValidity()` with its message, or `''` to clear it.

From there a schema error is just an error. It blocks submit and shows the
browser's bubble, it turns the control `user-invalid` once the field has been
touched, and the text field shows it in its `error` part. A control's own
errors come first: an email that isn't an email says so before the schema
gets a say.

The page doesn't use valibot for what the controls already check
(`required`, `type="email"`, `minlength`), so those keep the browser's
translated messages.

## Custom states

`ElementInternals.states` is a set of names the element switches on and off.
Each name matches `:state(name)`, from inside the component:

```css
:host(:state(checked)) .thumb {
  translate: 18px;
}
```

and from outside it, like any pseudo-class:

```css
form:has(:state(user-invalid)) .summary {
  display: block;
}
```

Unlike a reflected attribute, a state can't be set from markup or by a
script outside the element, and it doesn't add attributes to the host. `checked` on
`<fm-switch>` is deliberately not reflected: the page sees it only as
`:state(checked)`.

| State          | Set by            | On while                                        |
| -------------- | ----------------- | ----------------------------------------------- |
| `touched`      | `FormControl`     | it has lost focus, or a submit found it invalid |
| `dirty`        | `FormControl`     | its value differs from the first one            |
| `user-invalid` | `FormControl`     | it is touched and invalid                       |
| `empty`        | `<fm-text-field>` | it has no text                                  |
| `checked`      | `<fm-switch>`     | it is on                                        |
| `rated`        | `<fm-rating>`     | a star is picked                                |
| `previewing`   | `<fm-rating>`     | the pointer is over the stars                   |

`user-invalid` stands in for the native `:user-invalid`, which matches only
native controls, so errors wait until someone has been in the field.
`:invalid`, `:valid` and `:disabled` do work on form-associated elements
without any help.

The text field's error line is also a CSS part, `error`, so the page can
restyle it without reaching into the shadow root. `<fm-feedback>` puts a
warning sign in front of it:

```css
fm-text-field::part(error)::before {
  content: '⚠ ';
}
```

The field still decides when the line shows, from its own `user-invalid`
state. Parts and states combine too:
`fm-text-field:state(dirty)::part(error)` styles the error only on a field
that has been edited.

`:state()` needs Chrome 125, Safari 17.4 or Firefox 126.

## In this repository

The example is a workspace package and links the plugin built from this
checkout:

```sh
pnpm install      # from the repository root
pnpm build        # builds the plugin the example links
cd examples/forms
pnpm dev
```

On StackBlitz it installs the published plugin and plain Vite with npm, and
starts with `npm run stackblitz`: `stackblitz.mjs` is the playground's, which
explains why.
