/**
 * Auto-externalizes any module whose resolved path is a .node native binding. Catches both
 * direct `.node` imports and bare specifiers whose package main field points at a .node binary
 * (e.g. `@napi-rs/snappy-linux-x64-gnu`). esbuild cannot bundle .node binaries.
 */
export const externalNativePlugin = {
  name: 'external-native',
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true }));
  },
};
