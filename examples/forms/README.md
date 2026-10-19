# Forms

Form-associated custom elements in Lit. A text field, a switch, a star
rating and a tag list each take part in a plain `<form>` the way native
controls do: they go into `FormData`, block submit while invalid, reset with
the form and follow a disabled `<fieldset>`. What each one is doing is
exposed as custom states, which CSS reads with `:state()`. Every rule of the
form is one [valibot](https://valibot.dev) schema.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/oddcelot/vite-plugin-lit/tree/main/examples/forms?file=src/feedback-schema.ts)

The files in `src/`:

- **`form-control.ts`** is `FormControl<T>`, the base class every control
  extends. It holds the `ElementInternals` and does the form plumbing.
- **`form-schema.ts`** is `FormSchema`, a reactive controller that checks a
  form against any [Standard Schema](https://standardschema.dev) (valibot,
  Zod, ArkType) and puts each message on its control.
- **`feedback-schema.ts`** is the valibot schema with the form's rules.
- **`<fm-text-field>`**, **`<fm-switch>`**, **`<fm-rating>`** and
  **`<fm-tags>`** are the controls. Their values are a string, a boolean, a
  number and a `Set`.
- **`<fm-feedback>`** is the page: the form and what it submitted. It
  renders on a submit, a reset or the fieldset checkbox, and not while
  someone types.
- **`<fm-state-table>`** lists every control's states. It listens to the
  form named by its `for` attribute and redraws only itself.

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
2. **Turn the newsletter on, or give one or two stars.** Email is optional
   until the newsletter is on, and a low rating wants a comment or a tag.
3. **Fill it in and send.** The `FormData` the form built is printed below
   it: `newsletter: on` only while the switch is on, like a checkbox, and one
   `tags` entry per tag.
4. **Tick "Disable the fieldset"**, then press **Reset**. Every control
   matches `:disabled` and drops out of `FormData`, and Reset puts every
   value back to its default.
5. **Edit a file while the form is filled in.** Change the track colour in
   `src/fm-switch.ts`, and the switch restyles in place and stays on. Change
   the heading in `src/fm-feedback.ts`, and the plugin re-creates the
   controls in that template while keeping their values, so the edited
   markers stay and Reset still clears.

## A form

The page's markup holds no rules:

```html
<form>
  <fm-text-field name="name" label="Your name"></fm-text-field>
  <fm-rating name="rating"></fm-rating>
  <fm-tags name="tags" value="first visit" max="4"></fm-tags>
  <fm-switch name="newsletter"></fm-switch>
  …
</form>
```

They are all in one schema, over the controls' typed values:

```ts
export const FeedbackSchema = v.pipe(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.minLength(2, 'Tell us your name.')),
    rating: v.pipe(v.number(), v.minValue(1, 'Pick a rating.')),
    tags: v.set(v.string()),
    newsletter: v.boolean(),
    email: v.string(),
    // …
  }),
  // A rule about two fields: `forward` says which one to blame.
  v.forward(
    v.partialCheck(
      [['newsletter'], ['email']],
      ({newsletter, email}) => !newsletter || email !== '',
      'Add an email for the newsletter to go to.'
    ),
    ['email']
  )
);
```

and one line connects the two:

```ts
constructor() {
  super();
  new FormSchema(this, FeedbackSchema);
}
```

After every `input` and `change`, `FormSchema` collects each control's
`value` by `name`, validates them and calls `setCustomValidity()` on each
control with the first message filed under its name, or `''` to clear it.
From there a schema error is just an error: it blocks submit, shows the
browser's bubble, turns the control `user-invalid` once it has been touched,
and appears in the control's `error` part.

**One schema, not one per field.** The rules that matter most in a real form
read several fields, so they need the whole object anyway. Keeping every
rule in one schema leaves one place to read them, and
`v.InferOutput<typeof FeedbackSchema>` types what the form submits.

**Standard Schema, not valibot.** `FormSchema` calls only
`schema['~standard'].validate()`, so it works the same with Zod or ArkType,
and the controls know nothing about validation libraries.

**The controls still check themselves where the browser can.** A text field
with `type="email"` keeps the browser's own message for "nope", in the
browser's language, and that message comes before the schema's.

## A control

`FormControl<T>` takes care of `formAssociated`, `attachInternals()`, the
form callbacks, `required`, `setCustomValidity()`, the ARIA state, the tab
stop and the states below. A control declares its default and how its value
goes into the form and back. Here is the whole switch, minus its CSS:

```ts
@customElement('fm-switch')
export class FmSwitch extends FormControl<boolean> {
  // On at first; the `checked` attribute, as on a checkbox.
  @property({type: Boolean, attribute: 'checked'}) defaultValue = false;

  constructor() {
    super();
    this.internals.role = 'switch';
    this.addEventListener('click', () => this.commit(!this.value));
  }

  override render() {
    return html`<span class="track"><span class="thumb"></span></span>`;
  }

  protected toFormValue(on: boolean) {
    return on ? 'on' : null; // what FormData gets; null leaves it out
  }

  protected fromFormValue(value: FormValue) {
    return value !== null; // back from a restored page
  }
}
```

(The real one also toggles on Space and Enter, and sets `aria-checked`.)

- **`value` and `defaultValue`.** As on a native `<input>`, the attribute
  sets `defaultValue` and the `value` property holds the current value,
  which follows the default until someone changes it. A reset goes back to
  the default. The split also lets HMR keep what was typed: when a hot
  patch re-creates the control, the plugin leaves properties the template
  sets to the template and carries the rest over.
- **`commit(value)`** sets the value as a user would, firing `input` and
  `change`.
- **`toFormValue()`** can return a list. `<fm-tags>` hands over
  `[...tags]`, and the base class submits one entry per item under the
  control's `name`, as a `<select multiple>` does, so the server reads them
  with `formData.getAll('tags')`. For a value that isn't strings at all,
  such as a date range, `JSON.stringify()` going in and `JSON.parse()`
  coming back work the same way.
- **Replace, don't mutate.** Lit compares by identity, so
  `tags.value.add('x')` changes the set without updating anything. Assign a
  new set.
- **`validate()`** (optional) adds a control's own checks. The text field
  passes on its inner `<input>`'s verdict there.

The base class also gives every control what native controls have:
`form`, `labels`, `validity`, `validationMessage`, `willValidate`,
`checkValidity()`, `reportValidity()` and `setCustomValidity()`, plus
`name`, `disabled` and `required`.

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
script outside the element, and it doesn't add attributes to the host.
Whether a switch is on is deliberately not reflected: the page sees it only
as `:state(checked)`.

| State          | Set by                         | On while                                        |
| -------------- | ------------------------------ | ----------------------------------------------- |
| `touched`      | `FormControl`                  | it has lost focus, or a submit found it invalid |
| `dirty`        | `FormControl`                  | its value is not the default                    |
| `user-invalid` | `FormControl`                  | it is touched and invalid                       |
| `empty`        | `<fm-text-field>`, `<fm-tags>` | it has no text, or no tags                      |
| `checked`      | `<fm-switch>`                  | it is on                                        |
| `rated`        | `<fm-rating>`                  | a star is picked                                |
| `previewing`   | `<fm-rating>`                  | the pointer is over the stars                   |
| `full`         | `<fm-tags>`                    | it holds `max` tags; the input hides            |

`user-invalid` stands in for the native `:user-invalid`, which matches only
native controls, so errors wait until someone has been in the field.
`:invalid`, `:valid` and `:disabled` do work on form-associated elements
without any help.

The error line of the text field and of the tags is a CSS part, `error`, so
the page can restyle it without reaching into the shadow root.
`<fm-feedback>` puts a warning sign in front of it:

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
