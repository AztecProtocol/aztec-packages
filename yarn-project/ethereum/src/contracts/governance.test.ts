import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { Anvil } from '@viem/anvil';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { createL1Clients, deployL1Contracts } from '../deploy_l1_contracts.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemPublicClient, ViemWalletClient } from '../types.js';
import { GovernanceContract } from './governance.js';

describe('Governance', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let walletClient: ViemWalletClient;
  let publicClient: ViemPublicClient;
  let governance: GovernanceContract;
  beforeAll(async () => {
    logger = createLogger('ethereum:test:governance');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    ({ walletClient, publicClient } = createL1Clients([rpcUrl], privateKey));

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
    });

    governance = new GovernanceContract(
      deployed.l1ContractAddresses.governanceAddress.toString(),
      publicClient,
      walletClient,
    );
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });

  it('gets configuration', async () => {
    expect(governance).toBeDefined();
    const config = await governance.getConfiguration();
    expect(config).toBeDefined();
    expect(config.proposeConfig.lockDelay).toBeGreaterThan(0n);
    expect(config.proposeConfig.lockAmount).toBeGreaterThan(0n);
    expect(config.votingDelay).toBeGreaterThan(0n);
    expect(config.votingDuration).toBeGreaterThan(0n);
    expect(config.executionDelay).toBeGreaterThan(0n);
    expect(config.gracePeriod).toBeGreaterThan(0n);
    expect(config.quorum).toBeGreaterThan(0n);
    expect(config.voteDifferential).toBeGreaterThan(0n);
    expect(config.minimumVotes).toBeGreaterThan(0n);
  });
});
