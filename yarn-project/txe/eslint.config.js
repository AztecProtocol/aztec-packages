import config from '@aztec/foundation/eslint';

import { globalIgnores } from 'eslint/config';

// .cjs stubs are not part of the TS build (they're string-replaced by esbuild) and not
// listed in tsconfig, so typescript-eslint's project service refuses to parse them.
export default [...config, globalIgnores(['**/*.cjs'])];
