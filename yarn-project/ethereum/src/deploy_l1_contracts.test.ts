import { AztecAddress } from '@aztec/foundation/aztec-address';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { type Anvil } from '@viem/anvil';
import { getContract } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from './config.js';
import { type DeployL1ContractsArgs, deployL1Contracts } from './deploy_l1_contracts.js';
import { startAnvil } from './test/start_anvil.js';

describe('deploy_l1_contracts', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let initialValidators: EthAddress[];
  let l2FeeJuiceAddress: AztecAddress;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:deploy_l1_contracts');
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    initialValidators = times(3, EthAddress.random);
    l2FeeJuiceAddress = AztecAddress.random();

    ({ anvil, rpcUrl } = await startAnvil());
  });

  afterAll(async () => {
    await anvil.stop();
  });

  const deploy = (args: Partial<DeployL1ContractsArgs> = {}) =>
    deployL1Contracts(rpcUrl, privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      l2FeeJuiceAddress,
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
