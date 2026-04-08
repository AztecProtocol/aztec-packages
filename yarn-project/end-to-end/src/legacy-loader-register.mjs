// Registers the legacy-contracts loader hook. Use via:
//   NODE_OPTIONS="--import ./src/legacy-loader-register.mjs"
import { register } from 'node:module';

register('./legacy-loader.mjs', import.meta.url);
