import { jest } from '@jest/globals';

import {
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MV_CONSENSUS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
} from '../../multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

export const NODE_COUNT = 3;

export {
  jest,
  MOCK_GOSSIP_MULTI_VALIDATOR_OPTS,
  MV_CONSENSUS_TIMING,
  MultiNodeTestContext,
  type RegisteredValidator,
  buildMockGossipValidators,
};
