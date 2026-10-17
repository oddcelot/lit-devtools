/**
 * `client:on="<selector>"`: hydrate the island the first time the element
 * the selector names is clicked.
 *
 * @type {import('astro').ClientDirective}
 */
export default (load, {value}) => {
  document.querySelector(value)?.addEventListener(
    'click',
    async () => {
      const hydrate = await load();
      await hydrate();
    },
    {once: true}
  );
};
