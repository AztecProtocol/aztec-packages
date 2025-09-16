import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, type AztecNode, ContractDeployer, Fr, type Wallet, waitForProven } from '@aztec/aztec.js';
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
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
        aztecEpochDuration: 4,
        aztecSlotDuration: 12,
        aztecTargetCommitteeSize: 0,
        startProverNode: true,
      }));
    });

    afterAll(() => teardown());

    it('deploys a contract', async () => {
      const deployer = new ContractDeployer(artifact, wallet);

      const sender = ownerAddress;
      const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
        from: ownerAddress,
        contractAddressSalt: new Fr(BigInt(1)),
        skipClassPublication: true,
        skipInstancePublication: true,
      });
      const tx = await provenTx.send().wait();
      await waitForProven(aztecNode, tx, {
        provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
      });
      expect(tx.blockNumber).toBeDefined();
    });
  });
});
