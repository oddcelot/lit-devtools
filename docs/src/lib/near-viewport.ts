/**
 * Runs `load` once, when `el` comes within about a screen of the viewport.
 *
 * For the landing page's demos, live panel and video player. `loading="lazy"`
 * isn't enough there: on a slow connection Chrome starts lazy iframes up to
 * ~2500px ahead, which on a phone is every demo on the page, and their
 * scripts then compete with the hero for the main thread.
 */
export const whenNear = (el: Element, load: () => void): void => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        load();
      }
    },
    {rootMargin: '100% 0px'}
  );
  observer.observe(el);
};
