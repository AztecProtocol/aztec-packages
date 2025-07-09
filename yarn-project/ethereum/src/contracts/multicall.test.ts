import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';

import type { Anvil } from '@viem/anvil';
import { type GetContractReturnType, type PrivateKeyAccount, encodeFunctionData, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { type DeployL1ContractsReturnType, deployL1Contract, deployL1Contracts } from '../deploy_l1_contracts.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { FormattedViemError } from '../utils.js';
import { MULTI_CALL_3_ADDRESS, Multicall3, deployMulticall3 } from './multicall.js';

describe('Multicall3', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let walletClient: ExtendedViemWalletClient;
  let deployed: DeployL1ContractsReturnType;
  let tokenContract: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;
  let tokenAddress: `0x${string}`;
  let l1TxUtils: L1TxUtils;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:multicall');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    const vkTreeRoot = Fr.random();
    const protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    walletClient = createExtendedL1Client([rpcUrl], privateKey, foundry);

    deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: undefined,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    const { address: erc20Address, txHash: erc20TxHash } = await deployL1Contract(
      walletClient,
      TestERC20Abi,
      TestERC20Bytecode,
      ['test', 'TST', privateKey.address],
      '0x42',
      undefined,
      logger,
    );
    expect(erc20TxHash).toBeDefined();
    await walletClient.waitForTransactionReceipt({ hash: erc20TxHash! });
    tokenAddress = erc20Address.toString();
    tokenContract = getContract({
      address: erc20Address.toString(),
      abi: TestERC20Abi,
      client: walletClient,
    });

    l1TxUtils = new L1TxUtils(walletClient, logger);

    const addMinterHash = await tokenContract.write.addMinter([MULTI_CALL_3_ADDRESS], { account: privateKey });
    await walletClient.waitForTransactionReceipt({ hash: addMinterHash });
  });

  afterAll(async () => {
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  });

  const makeSuccessfulCall = () => ({
    to: tokenAddress,
    data: encodeFunctionData({
      abi: TestERC20Abi,
      functionName: 'mint',
      args: [privateKey.address, 100n],
    }),
    abi: TestERC20Abi,
  });

  const makeFailingCall = () => ({
    to: deployed.l1ContractAddresses.governanceProposerAddress.toString(),
    data: encodeFunctionData({
      abi: GovernanceProposerAbi,
      functionName: 'vote',
      args: [EthAddress.random().toString()],
    }),
    abi: GovernanceProposerAbi,
  });

  it('should be able to call multiple functions in a single transaction', async () => {
    await deployMulticall3(walletClient, logger);
    const result = await Multicall3.forward(
      [makeSuccessfulCall(), makeFailingCall()],
      l1TxUtils,
      undefined,
      undefined,
      deployed.l1ContractAddresses.rollupAddress.toString(),
      logger,
      { revertOnFailure: true },
    );
    expect(result).toBeDefined();
    expect(result).toBeInstanceOf(FormattedViemError);
    const formattedError = result as FormattedViemError;
    expect(formattedError.message).toContain('ValidatorSelection__InsufficientCommitteeSize');
  });

  it('should not revert by default if a single call fails', async () => {
    await deployMulticall3(walletClient, logger);
    const result = await Multicall3.forward(
      [makeSuccessfulCall(), makeFailingCall()],
      l1TxUtils,
      undefined,
      undefined,
      deployed.l1ContractAddresses.rollupAddress.toString(),
      logger,
    );
    expect(result).toBeDefined();
    expect('receipt' in result && result.receipt.status).toBe('success');
  });
});
