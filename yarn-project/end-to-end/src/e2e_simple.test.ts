import type { AztecNodeConfig } from '@aztec/aztec-node';
import { ContractDeployer, Fr, type Wallet } from '@aztec/aztec.js';
// eslint-disable-next-line no-restricted-imports
import { EthAddress } from '@aztec/foundation/eth-address';
import { StatefulTestContractArtifact } from '@aztec/noir-contracts.js/StatefulTest';

import { jest } from '@jest/globals';
import 'jest-extended';

import { setup } from './fixtures/utils.js';

describe('e2e_simple', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let owner: Wallet;
  let teardown: () => Promise<void>;
  let config: AztecNodeConfig;

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
      } = await setup(1, {
        customForwarderContractAddress: EthAddress.ZERO,
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
        aztecEpochDuration: 8,
        aztecProofSubmissionWindow: 16,
        aztecSlotDuration: 12,
        ethereumSlotDuration: 12,
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
      const tx = await provenTx
        .send()
        .wait({ proven: true, provenTimeout: config.aztecProofSubmissionWindow * config.aztecSlotDuration });
      expect(tx.blockNumber).toBeDefined();
    });
  });
});
