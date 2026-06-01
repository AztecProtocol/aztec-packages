/**
 * Generic resolver-redirect plugin. Each `rule` is `{filter, stub, importerContains?}`:
 *   - `filter`: regex matched against the specifier esbuild is trying to resolve.
 *   - `stub`: basename of a file under `esbuild/stubs/` to redirect to.
 *   - `importerContains` (optional): only fire if the importing file's path contains this
 *     substring. Used to gate relative-path filters (e.g. `./node_metrics.js`) so we don't
 *     accidentally hijack same-named files in another package.
 *
 * Rules are evaluated in order on each resolve callback; the first matching rule wins.
 */
export function redirectsPlugin(rules) {
  const resolved = rules.map(rule => ({
    ...rule,
    stubPath: new URL(`../stubs/${rule.stub}`, import.meta.url).pathname,
  }));
  return {
    name: 'redirects',
    setup(build) {
      for (const { filter, importerContains, stubPath } of resolved) {
        build.onResolve({ filter }, args => {
          if (importerContains && !args.importer.includes(importerContains)) {
            return null;
          }
          return { path: stubPath };
        });
      }
    },
  };
}
