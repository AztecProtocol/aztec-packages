// The app's Babel transformer (React Native's or Expo's, as withAztec found it), plus the plugin for
// `export * as ns from` (zod 4 uses it; React Native's preset does not transform it).
const upstream = require(process.env.AZTEC_RN_UPSTREAM_BABEL_TRANSFORMER || '@react-native/metro-babel-transformer');
const exportNamespaceFrom = require('@babel/plugin-transform-export-namespace-from');

module.exports = {
  ...upstream,
  transform(args) {
    return upstream.transform({ ...args, plugins: [...(args.plugins || []), exportNamespaceFrom] });
  },
};
