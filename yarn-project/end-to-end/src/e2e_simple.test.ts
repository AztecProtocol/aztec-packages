import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';

import { jest } from '@jest/globals';
import 'jest-extended';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

// Basic smoke tests for the production sequencer + prover node path. Uses PIPELINING_SETUP_OPTS
// (prod sequencer, ethSlot=4s, aztecSlot=12s, epochDuration=4, fake prover via startProverNode).
// Exercises block-data queries and waits for a deployed tx to reach proven status.
describe('e2e_simple', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let wallet: Wallet;
  let ownerAddress: AztecAddress;
  let teardown: () => Promise<void>;
  let config: AztecNodeConfig;
  let aztecNode: AztecNode;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Suite exercising node block-data API and end-to-end deploy+prove flow with a fake prover.
  describe('A simple test', () => {
    const artifact = StatefulTestContractArtifact;

    beforeAll(async () => {
      ({
        teardown,
        wallet,
        accounts: [ownerAddress],
        config,
        aztecNode,
      } = await setup(1, {
        ...PIPELINING_SETUP_OPTS,
        archiverPollingIntervalMS: 200,
        sequencerPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
        aztecEpochDuration: 4,
        aztecTargetCommitteeSize: 0,
        startProverNode: true,
      }));
    });

    afterAll(() => teardown());

    // Fetches block 0 by number and by hash; asserts the returned blocks match and contain no txEffects.
    it('returns initial block data', async () => {
      const initialHeader = (await aztecNode.getBlockData(BlockNumber.ZERO))?.header;
      expect(initialHeader).toBeDefined();
      const initialHeaderHash = await initialHeader!.hash();
      const initialBlockByHash = await aztecNode.getBlock(initialHeaderHash, { includeTransactions: true });
      expect(initialBlockByHash).toBeDefined();
      expect(initialBlockByHash!.hash.equals(initialHeaderHash)).toBeTrue();
      expect(initialBlockByHash!.body.txEffects.length).toBe(0);
      const initialBlockByNumber = await aztecNode.getBlock(BlockNumber.ZERO, { includeTransactions: true });
      expect(initialBlockByNumber).toBeDefined();
      expect(initialBlockByNumber!.hash.equals(initialHeaderHash)).toBeTrue();
      expect(initialBlockByNumber!.body.txEffects.length).toBe(0);
    });

    // Deploys StatefulTestContract via ContractDeployer and waits for the tx to reach proven status
    // using waitForProven, exercising the full sequencer→prover-node→L1 proof submission path.
    it('deploys a contract', async () => {
      const deployer = new ContractDeployer(artifact, wallet);

      const { receipt: txReceipt } = await deployer
        .deploy([ownerAddress, 1], { salt: new Fr(BigInt(1)) })
        .send({ from: ownerAddress });
      await waitForProven(aztecNode, txReceipt, {
        provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
      });
      expect(txReceipt.blockNumber).toBeDefined();
    });
  });
});
