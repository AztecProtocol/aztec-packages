import type { EpochProverFactory } from '@aztec/prover-client';
import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

import type { ProofPublishingService } from '../proof-publishing-service.js';
import { ProverNode } from '../prover-node.js';
import type { SessionManager } from '../session-manager.js';

abstract class TestProverNodeClass extends ProverNode {
  declare public prover: EpochProverManager & EpochProverFactory;
  declare public publishingService: ProofPublishingService;
  declare public sessionManager: SessionManager;
}

export type TestProverNode = TestProverNodeClass;
