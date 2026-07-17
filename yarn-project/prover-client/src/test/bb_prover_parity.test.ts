import { BBNativeRollupProver, type BBProverConfig } from '@aztec/bb-prover';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { ServerProtocolArtifact } from '@aztec/noir-protocol-circuits-types/server';
import { ServerCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { L1ToL2MessageSponge } from '@aztec/stdlib/messaging';
import { INBOX_PARITY_SIZES, InboxParityPrivateInputs, type InboxParitySize } from '@aztec/stdlib/parity';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:bb-prover-parity');

// Maps a ladder size to its server artifact name, mirroring the bb-prover's own selection.
const artifactForSize: Record<InboxParitySize, ServerProtocolArtifact> = {
  64: 'InboxParity64Artifact',
  256: 'InboxParity256Artifact',
  1024: 'InboxParity1024Artifact',
};

describe('prover/bb_prover/parity', () => {
  const FAKE_PROOFS = parseBooleanEnv(process.env.FAKE_PROOFS);

  let context: TestContext;
  let bbProver: BBNativeRollupProver | undefined;

  beforeAll(async () => {
    const buildProver = async (bbConfig: BBProverConfig) => {
      bbConfig.circuitFilter = Object.values(artifactForSize);
      bbProver = await BBNativeRollupProver.new(bbConfig);
      return bbProver;
    };
    context = await TestContext.new(logger, {
      proverCount: 1,
      createProver: FAKE_PROOFS ? undefined : buildProver,
    });
  });

  afterAll(async () => {
    await context.cleanup();
  });

  // One InboxParity proof per checkpoint, sized to the smallest ladder rung that fits. Prove and verify each rung.
  it.each(INBOX_PARITY_SIZES)(
    'proves and verifies the inbox parity circuit at size %i',
    async size => {
      // Fill the rung with real messages so `numMessages === size` (the largest circuit for that rung).
      const messages = Array.from({ length: size }, () => Fr.random());
      const proverId = Fr.random();
      const inHash = Fr.random();

      const inputs = InboxParityPrivateInputs.fromMessages(
        messages,
        Fr.ZERO,
        L1ToL2MessageSponge.empty(),
        inHash,
        getVKTreeRoot(),
        proverId,
      );
      expect(inputs.size).toBe(size);

      const output = await context.prover.getInboxParityProof(inputs);

      const artifact = artifactForSize[size as InboxParitySize];
      // Sanity: the VK the proof was generated against is the one in the vk tree for this rung.
      expect(ServerCircuitVks[artifact].keyAsFields.hash).toEqual(output.verificationKey.keyAsFields.hash);

      if (bbProver) {
        await expect(bbProver.verifyProof(artifact, output.proof.binaryProof)).resolves.not.toThrow();
      }
    },
    FAKE_PROOFS ? undefined : 600_000,
  );
});
