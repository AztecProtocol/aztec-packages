// Replaces zod's `locales/index.js` barrel (which re-exports every i18n bundle: ar, az, be, bg,
// ca, cs, da, de, el, eo, es, fa, fi, fr, …) with just `en`. Zod only needs one locale at
// runtime; TXE never surfaces user-visible validation messages in any other language. The
// alias is wired in esbuild.config.mjs.
export { default as en } from 'zod/v4/locales/en.js';
