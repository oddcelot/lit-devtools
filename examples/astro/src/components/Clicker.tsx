import {useState} from 'preact/hooks';

/** A Preact island, to share the page with Lit's. */
export default function Clicker() {
  const [count, setCount] = useState(0);
  return (
    <button id="preact" onClick={() => setCount(count + 1)}>
      Preact: {count}
    </button>
  );
}
