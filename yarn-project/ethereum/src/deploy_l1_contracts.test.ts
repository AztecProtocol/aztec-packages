import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { Logger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';

import { createEthereumChain } from './chain.js';
import { DefaultL1ContractsConfig } from './config.js';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import type { DeployL1ContractsArgs } from './deploy_l1_contracts.js';
import { startAnvil } from './test/start_anvil.js';

describe('deploy_l1_contracts', () => {
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let genesisArchiveRoot: Fr;
  let genesisBlockHash: Fr;
  let initialValidators: EthAddress[];
  let l2FeeJuiceAddress: Fr;

  // Use these environment variables to run against a live node. Eg to test against spartan's eth-devnet:
  // BLOCK_TIME=1 spartan/aztec-network/eth-devnet/run-locally.sh
  // LOG_LEVEL=verbose L1_RPC_URL=http://localhost:8545 L1_CHAIN_ID=1337 yarn test deploy_l1_contracts
  const chainId = process.env.L1_CHAIN_ID ? parseInt(process.env.L1_CHAIN_ID, 10) : 31337;
  let rpcUrl = process.env.L1_RPC_URL;
  let stop: () => Promise<void> = () => Promise.resolve();

  beforeAll(async () => {
    logger = createLogger('ethereum:test:deploy_l1_contracts');
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    genesisArchiveRoot = Fr.random();
    genesisBlockHash = Fr.random();
    initialValidators = times(3, EthAddress.random);
    // Valid AztecAddress represented by its xCoord as a Fr
    l2FeeJuiceAddress = Fr.fromHexString('0x302dbc2f9b50a73283d5fb2f35bc01eae8935615817a0b4219a057b2ba8a5a3f');

    if (!rpcUrl) {
      ({ stop, rpcUrl } = await startAnvil());
    }
  });

  afterAll(async () => {
    if (stop) {
      try {
        await stop();
      } catch (err) {
        createLogger('ethereum:cleanup').error(`Error during cleanup`, err);
      }
    }
  });

  const deploy = (args: Partial<DeployL1ContractsArgs> = {}) =>
    deployL1Contracts(rpcUrl!, privateKey, createEthereumChain(rpcUrl!, chainId).chainInfo, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot,
      genesisBlockHash,
      l2FeeJuiceAddress,
      l1TxConfig: { checkIntervalMs: 100 },
      ...args,
    });

  const getRollup = (deployed: Awaited<ReturnType<typeof deploy>>) =>
    getContract({
      address: deployed.l1ContractAddresses.rollupAddress.toString(),
      abi: RollupAbi,
      client: deployed.publicClient,
    });

  it('deploys without salt', async () => {
    await deploy();
  });

  it('deploys initializing validators', async () => {
    const deployed = await deploy({ initialValidators });
    const rollup = getRollup(deployed);
    for (const validator of initialValidators) {
      const { status } = await rollup.read.getInfo([validator.toString()]);
      expect(status).toBeGreaterThan(0);
    }
  });

  it('deploys with salt on different addresses', async () => {
    const first = await deploy({ salt: 42 });
    const second = await deploy({ salt: 43 });

    expect(first.l1ContractAddresses).not.toEqual(second.l1ContractAddresses);
  });

  it('deploys twice with salt on same addresses', async () => {
    const first = await deploy({ salt: 44 });
    const second = await deploy({ salt: 44 });

    expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);
  });

  it('deploys twice with salt on same addresses initializing validators', async () => {
    const first = await deploy({ salt: 44, initialValidators });
    const second = await deploy({ salt: 44, initialValidators });

    expect(first.l1ContractAddresses).toEqual(second.l1ContractAddresses);

    const rollup = getRollup(first);
    for (const validator of initialValidators) {
      const { status } = await rollup.read.getInfo([validator.toString()]);
      expect(status).toBeGreaterThan(0);
    }
  });
});
