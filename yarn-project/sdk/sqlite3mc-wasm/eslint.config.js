import config from '@aztec/foundation/eslint';

import { globalIgnores } from 'eslint/config';

export default [globalIgnores(['vendor/**']), ...config];
