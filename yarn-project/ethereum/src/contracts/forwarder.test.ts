import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';

import { type Anvil } from '@viem/anvil';
import {
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  encodeFunctionData,
  getContract,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { createL1Clients, deployL1Contract, deployL1Contracts } from '../deploy_l1_contracts.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemPublicClient, ViemWalletClient } from '../types.js';
import { FormattedViemError } from '../utils.js';
import { ForwarderContract } from './forwarder.js';

describe('Forwarder', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let l2FeeJuiceAddress: AztecAddress;
  let walletClient: ViemWalletClient;
  let publicClient: ViemPublicClient;
  let forwarder: ForwarderContract;
  let l1TxUtils: L1TxUtils;
  let govProposerAddress: EthAddress;
  let tokenAddress: EthAddress;
  let tokenContract: GetContractReturnType<typeof TestERC20Abi, PublicClient<HttpTransport, Chain>>;
  beforeAll(async () => {
    logger = createLogger('ethereum:test:forwarder');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    l2FeeJuiceAddress = await AztecAddress.random();

    ({ anvil, rpcUrl } = await startAnvil());

    ({ walletClient, publicClient } = createL1Clients([rpcUrl], privateKey));

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      l2FeeJuiceAddress,
    });

    govProposerAddress = deployed.l1ContractAddresses.governanceProposerAddress;

    forwarder = await ForwarderContract.create(
      privateKey.address,
      walletClient,
      publicClient,
      logger,
      deployed.l1ContractAddresses.rollupAddress.toString(),
    );

    l1TxUtils = new L1TxUtils(publicClient, walletClient, logger);

    const { address: erc20Address, txHash: erc20TxHash } = await deployL1Contract(
      walletClient,
      publicClient,
      TestERC20Abi,
      TestERC20Bytecode,
      ['test', 'TST', privateKey.address],
      '0x42',
      undefined,
      logger,
    );
    expect(erc20TxHash).toBeDefined();
    await publicClient.waitForTransactionReceipt({ hash: erc20TxHash! });
    tokenAddress = erc20Address;
    tokenContract = getContract({
      address: tokenAddress.toString(),
      abi: TestERC20Abi,
      client: publicClient,
    });

    const freeForAllHash = await tokenContract.write.setFreeForAll([true], { account: privateKey });
    await publicClient.waitForTransactionReceipt({ hash: freeForAllHash });

    logger.info(`Token address: ${tokenAddress}`);
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('gets good error messages', async () => {
    expect(forwarder).toBeDefined();
    const initialBalance = await tokenContract.read.balanceOf([privateKey.address]);
    expect(initialBalance).toBe(0n);
    const err = await forwarder
      .forward(
        [
          // This one passes
          {
            to: tokenAddress.toString(),
            data: encodeFunctionData({
              abi: TestERC20Abi,
              functionName: 'mint',
              args: [privateKey.address, 100n],
            }),
          },

          // This one fails
          {
            to: govProposerAddress.toString(),
            data: encodeFunctionData({
              abi: GovernanceProposerAbi,
              functionName: 'vote',
              args: [EthAddress.random().toString()],
            }),
          },
        ],
        l1TxUtils,
        undefined,
        undefined,
        logger,
      )
      .catch(err => err);
    expect(err).toBeDefined();
    expect(err).toBeInstanceOf(FormattedViemError);
    expect(err.message).toMatch(/GovernanceProposer__OnlyProposerCanVote/);
  });
});
