// Values a binding can't take.
import {LitElement, html} from 'lit';

export class Bindings extends LitElement {
  label = 'large';

  render() {
    return html`
      <!-- binding-type: \`.size\` takes \`'small' | 'large'\`, not \`'huge'\`. -->
      <x-button .size=${'huge'}>Press</x-button>

      <!-- binding-type: \`?disabled\` takes a boolean, not a string. -->
      <x-button ?disabled=${'no'}>Press</x-button>

      <!-- binding-type: \`title\` is set to the text \`true\`; write \`?title\`. -->
      <x-button title=${true}>Press</x-button>

      <!-- binding-type: \`@click\` takes a function, not a number. -->
      <x-button @click=${1}>Press</x-button>

      <!-- event-type: \`press\` sends \`{size}\`, but the handler expects \`detail.count\`. -->
      <x-button @press=${this.#onPress}>Press</x-button>

      <!-- binding-type, when you save and in \`npm run check\`: \`label\` is any
           string, not \`'small' | 'large'\`. Reading it as you type would take a
           type checker, so the editor runs TypeScript on save. -->
      <x-button .size=${this.label}>Press</x-button>
    `;
  }

  #onPress(e: CustomEvent<{count: number}>) {
    console.log(e.detail.count);
  }
}
