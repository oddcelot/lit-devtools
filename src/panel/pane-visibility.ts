/**
 * Whether the panel can be seen at all. The DevTools dock keeps a collapsed
 * dock's iframe alive, faded out and sized to nothing, so the panel never
 * unloads or disconnects; what it drew on the page would stay there with no
 * panel in sight. An `IntersectionObserver` on the panel's own document sees
 * the frame leave the viewport in every browser, whatever the host does to
 * hide it.
 *
 * Calls `onChange` with each change, starting with the first reading, and
 * returns a function that stops watching. Where there is no
 * `IntersectionObserver` the panel counts as always visible and `onChange`
 * is never called.
 */
export const watchPaneVisibility = (
  onChange: (visible: boolean) => void
): (() => void) => {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  let visible: boolean | undefined;
  const observer = new IntersectionObserver((entries) => {
    const next = entries.at(-1)?.isIntersecting ?? true;
    if (next === visible) return;
    visible = next;
    onChange(next);
  });
  observer.observe(document.documentElement);
  return () => observer.disconnect();
};
