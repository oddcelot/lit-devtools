import {useState} from 'preact/hooks';
import './ssr-counter.ts';
import './tag-list.ts';

/**
 * A Preact component that renders Lit elements and passes them its state.
 * Preact renders them on the server as plain tags; Lit renders them once
 * their classes are defined in the browser.
 */
export default function LitInPreact({id}: {id: string}) {
  const [tags, setTags] = useState(['from', 'preact']);
  return (
    <section id={id} class="lit-in-preact">
      <ssr-counter start={5} />
      <tag-list tags={tags}>
        <h3 slot="title">Tags from Preact state</h3>
      </tag-list>
      <button class="more" onClick={() => setTags([...tags, 'more'])}>
        Add a tag from Preact
      </button>
    </section>
  );
}
