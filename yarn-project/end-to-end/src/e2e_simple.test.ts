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

import { setup } from './fixtures/utils.js';

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
        archiverPollingIntervalMS: 200,
        sequencerPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
        aztecEpochDuration: 4,
        aztecSlotDuration: 12,
        ethereumSlotDuration: 4,
        aztecTargetCommitteeSize: 0,
        startProverNode: true,
      }));
    });

    afterAll(() => teardown());

    it('returns initial block data', async () => {
      const initialHeader = await aztecNode.getBlockHeader(BlockNumber.ZERO);
      expect(initialHeader).toBeDefined();
      const initialHeaderHash = await initialHeader!.hash();
      const initialBlockByHash = await aztecNode.getBlockByHash(initialHeaderHash);
      expect(initialBlockByHash).toBeDefined();
      const initialBlockHash = await initialBlockByHash!.hash();
      expect(initialBlockHash.equals(initialHeaderHash)).toBeTrue();
      expect(initialBlockByHash?.body.txEffects.length).toBe(0);
      const initialBlockByNumber = await aztecNode.getBlock(BlockNumber.ZERO);
      expect(initialBlockByNumber).toBeDefined();
      const initialBlockByNumberHash = await initialBlockByNumber!.hash();
      expect(initialBlockByNumberHash.equals(initialHeaderHash)).toBeTrue();
      expect(initialBlockByNumber?.body.txEffects.length).toBe(0);
    });

    it('deploys a contract', async () => {
      const deployer = new ContractDeployer(artifact, wallet);

      const sender = ownerAddress;
      const tx = deployer.deploy(ownerAddress, sender, 1).send({
        from: ownerAddress,
        contractAddressSalt: new Fr(BigInt(1)),
        skipClassPublication: true,
        skipInstancePublication: true,
      });
      const receipt = await tx.wait();
      await waitForProven(aztecNode, receipt, {
        provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
      });
      expect(receipt.blockNumber).toBeDefined();
    });
  });
});
