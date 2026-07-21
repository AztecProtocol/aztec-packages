import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { GovernanceProposerAbi } from '@aztec/l1-artifacts/GovernanceProposerAbi';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';

import { type GetContractReturnType, type PrivateKeyAccount, encodeFunctionData, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { type DeployAztecL1ContractsReturnType, deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { deployL1Contract } from '../deploy_l1_contract.js';
import { L1TxUtils, createL1TxUtils } from '../l1_tx_utils/index.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { MULTI_CALL_3_ADDRESS, Multicall3, deployMulticall3 } from './multicall.js';

describe('Multicall3', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;
  let walletClient: ExtendedViemWalletClient;
  let deployed: DeployAztecL1ContractsReturnType;
  let tokenContract: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;
  let tokenAddress: `0x${string}`;
  let l1TxUtils: L1TxUtils;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:multicall');
    // this is the 6th address that gets funded by the junk mnemonic
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    privateKey = privateKeyToAccount(privateKeyRaw);
    const vkTreeRoot = Fr.random();
    const protocolContractsHash = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    walletClient = createExtendedL1Client([rpcUrl], privateKey, foundry);

    deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot,
      protocolContractsHash,
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });

    const { address: erc20Address, txHash: erc20TxHash } = await deployL1Contract(
      walletClient,
      TestERC20Abi,
      TestERC20Bytecode,
      ['test', 'TST', privateKey.address],
      { salt: '0x42', logger },
    );
    expect(erc20TxHash).toBeDefined();
    await walletClient.waitForTransactionReceipt({ hash: erc20TxHash! });
    tokenAddress = erc20Address.toString();
    tokenContract = getContract({
      address: erc20Address.toString(),
      abi: TestERC20Abi,
      client: walletClient,
    });

    l1TxUtils = createL1TxUtils(walletClient, { logger });

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
      functionName: 'signal',
      args: [EthAddress.random().toString()],
    }),
    abi: GovernanceProposerAbi,
  });

  it('should not revert by default if a single call fails', async () => {
    await deployMulticall3(walletClient, logger);
    const result = await Multicall3.forward([makeSuccessfulCall(), makeFailingCall()], l1TxUtils, undefined, undefined);
    expect(result).toBeDefined();
    expect(result.receipt.status).toBe('success');
  });

  describe('simulateAggregate3', () => {
    beforeAll(async () => {
      await deployMulticall3(walletClient, logger);
    });

    it('decodes per-entry results when all entries succeed', async () => {
      const result = await Multicall3.simulateAggregate3([makeSuccessfulCall(), makeSuccessfulCall()], l1TxUtils);
      expect(result.kind).toBe('decoded');
      if (result.kind !== 'decoded') {
        return;
      }
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].success).toBe(true);
      expect(result.entries[1].success).toBe(true);
      expect(result.gasUsed).toBeGreaterThan(0n);
    });

    it('marks reverted entries with a decoded revert reason', async () => {
      const result = await Multicall3.simulateAggregate3([makeSuccessfulCall(), makeFailingCall()], l1TxUtils);
      expect(result.kind).toBe('decoded');
      if (result.kind !== 'decoded') {
        return;
      }
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].success).toBe(true);
      expect(result.entries[1].success).toBe(false);
      expect(result.entries[1].revertReason).toContain('ValidatorSelection__InsufficientValidatorSetSize');
    });

    it('honours fakeSenderBalance by overriding the sender balance for the simulate', async () => {
      // Use a sender we have not funded so a real send would fail with insufficient funds.
      const poorPrivateKey = '0x' + 'aa'.repeat(32);
      const poorAccount = privateKeyToAccount(poorPrivateKey as `0x${string}`);
      const poorClient = createExtendedL1Client([rpcUrl], poorAccount, foundry);
      const poorL1TxUtils = createL1TxUtils(poorClient, { logger });

      // Without fakeSenderBalance, the simulate would not fail on entry-level (call doesn't need
      // value), but the eth_simulateV1 may still validate sender funds for gas. Either way, with
      // fakeSenderBalance we explicitly cap balance high enough that no balance-related path can
      // fail in the simulate.
      const result = await Multicall3.simulateAggregate3([makeSuccessfulCall()], poorL1TxUtils, {
        fakeSenderBalance: 10n ** 20n,
      });
      expect(result.kind).toBe('decoded');
      if (result.kind !== 'decoded') {
        return;
      }
      expect(result.entries[0].success).toBe(true);
    });

    it('reports hasCode() true after deployMulticall3', async () => {
      expect(await Multicall3.hasCode(l1TxUtils)).toBe(true);
    });
  });
});
