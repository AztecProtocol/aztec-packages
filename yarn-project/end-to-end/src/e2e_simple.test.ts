// docs:start:import_aztecjs
import { ContractDeployer, Fr, type Wallet } from '@aztec/aztec.js';
// docs:end:import_aztecjs
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('A simple test', () => {
    const artifact = StatefulTestContractArtifact;

    beforeAll(async () => {
      ({
        teardown,
        wallets: [owner],
      } = await setup(1, {
        customForwarderContractAddress: EthAddress.ZERO,
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        minTxsPerBlock: 1,
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
      expect(tx.blockNumber).toBeDefined();
    });
  });
});
