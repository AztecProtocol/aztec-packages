// Preloaded (NODE_OPTIONS=--import) while noir's js packages build. Node 26 loads an extensionless
// file in a "type": "module" package as ESM, and yargs 17.7.2's CommonJS entry `yargs/yargs` is
// one, so tsc-multi's require() of it throws. Load that file as CommonJS. yargs 17.7.3 ships
// `yargs.cjs` instead; drop this once noir-repo's lockfile has it.
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/node_modules/yargs/yargs')) return nextLoad(url, { ...context, format: 'commonjs' });
    return nextLoad(url, context);
  },
});
