import { createExtendedL1Client, getPublicClient } from '@aztec/ethereum/client';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { Anvil } from '@viem/anvil';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import { GovernanceContract, ReadOnlyGovernanceContract } from './governance.js';

describe('Governance', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let publicClient: ViemClient;
  let walletClient: ExtendedViemWalletClient;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractsHash: Fr;
  let governanceAddress: `0x${string}`;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:governance');
    // this is the 6th address that gets funded by the junk mnemonic
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    privateKey = privateKeyToAccount(privateKeyRaw);
    vkTreeRoot = Fr.random();
    protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil(logger));

    walletClient = createExtendedL1Client([rpcUrl], privateKey, foundry);
    publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: 31337 });

    const deployed = await deployAztecL1Contracts(
      rpcUrl,
      privateKeyRaw,
      foundry.id,
      {
        ...DefaultL1ContractsConfig,
        vkTreeRoot,
        protocolContractsHash,
        genesisArchiveRoot: Fr.random(),
        realVerifier: false,
      },
      createLogger('ethereum:test:governance'),
    );

    governanceAddress = deployed.l1ContractAddresses.governanceAddress.toString() as `0x${string}`;
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('ReadOnlyGovernanceContract', () => {
    let readOnlyGovernance: ReadOnlyGovernanceContract;

    beforeEach(() => {
      readOnlyGovernance = new ReadOnlyGovernanceContract(governanceAddress, publicClient);
    });

    it('can be instantiated with public client but not wallet methods', () => {
      expect(readOnlyGovernance).toBeDefined();
      expect(readOnlyGovernance.client).toBe(publicClient);

      // Verify wallet-specific methods are not available
      expect(readOnlyGovernance).not.toHaveProperty('deposit');
      expect(readOnlyGovernance).not.toHaveProperty('proposeWithLock');
      expect(readOnlyGovernance).not.toHaveProperty('vote');
      expect(readOnlyGovernance).not.toHaveProperty('executeProposal');
    });

    it('has all read-only methods', () => {
      expect(readOnlyGovernance.getGovernanceProposerAddress).toBeDefined();
      expect(readOnlyGovernance.getConfiguration).toBeDefined();
      expect(readOnlyGovernance.getProposal).toBeDefined();
      expect(readOnlyGovernance.getProposalState).toBeDefined();
      expect(readOnlyGovernance.awaitProposalActive).toBeDefined();
      expect(readOnlyGovernance.awaitProposalExecutable).toBeDefined();
    });
  });

  describe('GovernanceContract', () => {
    let governance: GovernanceContract;

    beforeEach(() => {
      governance = new GovernanceContract(governanceAddress, walletClient);
    });

    it('can be instantiated with wallet client and has write methods', () => {
      expect(governance).toBeDefined();
      expect(governance.client).toBe(walletClient);

      // Verify wallet-specific methods are available
      expect(governance.deposit).toBeDefined();
      expect(governance.proposeWithLock).toBeDefined();
      expect(governance.vote).toBeDefined();
      expect(governance.executeProposal).toBeDefined();
    });

    it('inherits all read-only methods from ReadOnlyGovernanceContract', () => {
      expect(governance.getGovernanceProposerAddress).toBeDefined();
      expect(governance.getConfiguration).toBeDefined();
      expect(governance.getProposal).toBeDefined();
      expect(governance.getProposalState).toBeDefined();
      expect(governance.awaitProposalActive).toBeDefined();
      expect(governance.awaitProposalExecutable).toBeDefined();
    });

    it('cannot be instantiated with public client', () => {
      expect(() => {
        new GovernanceContract(governanceAddress, publicClient as any);
      }).toThrow();
    });
  });

  it('gets configuration', async () => {
    const governance = new GovernanceContract(governanceAddress, walletClient);
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
    expect(config.requiredYeaMargin).toBeGreaterThan(0n);
    expect(config.minimumVotes).toBeGreaterThan(0n);
  });
});
