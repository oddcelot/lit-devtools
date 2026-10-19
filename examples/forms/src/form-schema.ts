import type {LitElement, ReactiveController} from 'lit';
import {FormControl} from './form-control';

type PathItem = PropertyKey | {readonly key: PropertyKey};

/**
 * The part of the Standard Schema interface (https://standardschema.dev)
 * this needs. valibot, Zod and ArkType schemas all have it, so this file
 * imports none of them.
 */
interface StandardSchema {
  readonly '~standard': {
    validate(value: unknown): StandardResult | Promise<StandardResult>;
  };
}
type StandardResult = {
  readonly issues?: ReadonlyArray<{
    readonly message: string;
    readonly path?: ReadonlyArray<PathItem>;
  }>;
};

/**
 * Checks a form against one schema. After every change it collects the
 * `value` of each control (set by the time the event arrives), keyed by `name` (typed: a number from a rating, a
 * `Set` from the tags), validates them and gives each control the first
 * message filed under its name through `setCustomValidity()`. From there a
 * schema error is like any other: it blocks submit and shows the browser's
 * bubble.
 *
 *     #schema = new FormSchema(this, FeedbackSchema);
 *
 * It reads the `<form>` in the host's shadow root. Native controls in it are
 * not checked.
 */
export class FormSchema implements ReactiveController {
  #run = 0;

  constructor(
    private readonly host: LitElement,
    private readonly schema: StandardSchema
  ) {
    host.addController(this);
  }

  hostConnected() {
    const root = this.host.renderRoot;
    root.addEventListener('input', this.#check);
    root.addEventListener('change', this.#check);
    root.addEventListener('reset', this.#afterReset);
  }

  hostDisconnected() {
    const root = this.host.renderRoot;
    root.removeEventListener('input', this.#check);
    root.removeEventListener('change', this.#check);
    root.removeEventListener('reset', this.#afterReset);
  }

  hostUpdated() {
    if (this.#run === 0) {
      this.#check();
    }
  }

  // The controls take their defaults back after the `reset` event.
  #afterReset = () => setTimeout(this.#check);

  #check = async () => {
    const run = ++this.#run;
    const form = this.host.renderRoot.querySelector('form');
    const controls = [...(form?.elements ?? [])].filter(
      (el): el is FormControl<unknown> => el instanceof FormControl
    );
    const values = Object.fromEntries(controls.map((c) => [c.name, c.value]));
    const {issues = []} = await this.schema['~standard'].validate(values);
    // A slower check that started earlier must not undo a newer one.
    if (run !== this.#run) {
      return;
    }
    const messages = new Map<PropertyKey, string>();
    for (const {message, path = []} of issues) {
      const [first] = path;
      const key = typeof first === 'object' ? first.key : first;
      if (key !== undefined && !messages.has(key)) {
        messages.set(key, message);
      }
    }
    for (const control of controls) {
      control.setCustomValidity(messages.get(control.name) ?? '');
    }
  };
}
