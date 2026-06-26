import { jest } from '@jest/globals';

import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

export { jest, SingleNodeTestContext };
