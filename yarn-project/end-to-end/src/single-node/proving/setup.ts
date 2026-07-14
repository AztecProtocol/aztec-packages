import { jest } from '@jest/globals';

import { NO_REORG_SUBMISSION_EPOCHS, PROVING_SLOT_TIMING, setupWithProver } from '../setup.js';
import { SingleNodeTestContext, WORLD_STATE_CHECKPOINT_HISTORY } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

export {
  jest,
  setupWithProver,
  SingleNodeTestContext,
  WORLD_STATE_CHECKPOINT_HISTORY,
  NO_REORG_SUBMISSION_EPOCHS,
  PROVING_SLOT_TIMING,
};
