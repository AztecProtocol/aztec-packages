import type { AztecNodeConfig } from '@aztec/aztec-node';
import { type AztecNode, ContractDeployer, Fr, type Wallet, waitForProven } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/foundation/eth-address';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';

import { jest } from '@jest/globals';
import 'jest-extended';

import { setup } from './fixtures/utils.js';

describe('e2e_simple', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let owner: Wallet;
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
        wallets: [owner],
        config,
        aztecNode,
      } = await setup(1, {
        customForwarderContractAddress: EthAddress.ZERO,
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
        aztecEpochDuration: 4,
        aztecProofSubmissionWindow: 8,
        aztecSlotDuration: 12,
        ethereumSlotDuration: 4,
        startProverNode: true,
      }));
    });

    afterAll(() => teardown());

    it('deploys a contract', async () => {
      const deployer = new ContractDeployer(artifact, owner);

      const ownerAddress = owner.getCompleteAddress().address;
      const sender = ownerAddress;
      const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
        contractAddressSalt: new Fr(BigInt(1)),
        skipClassRegistration: true,
        skipPublicDeployment: true,
      });
      const tx = await provenTx.send().wait();
      await waitForProven(aztecNode, tx, {
        provenTimeout: config.aztecProofSubmissionWindow * config.aztecSlotDuration,
      });
      expect(tx.blockNumber).toBeDefined();
    });
  });
});
