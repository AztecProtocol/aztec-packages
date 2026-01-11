import { bufferFrom } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TestERC20Abi, TestERC20Bytecode } from '@aztec/l1-artifacts';

import type { Anvil } from '@viem/anvil';
import { type Hex, encodeFunctionData, parseEventLogs } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { FORWARDER_ABI, FORWARDER_BYTECODE } from '../forwarder_proxy.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { ForwarderL1TxUtils } from './forwarder_l1_tx_utils.js';
import { createViemSigner } from './signer.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
const logger = createLogger('ethereum:test:forwarder_l1_tx_utils');

describe('ForwarderL1TxUtils', () => {
  const initialBaseFee = WEI_CONST; // 1 gwei

  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let dateProvider: TestDateProvider;
  let port: number = 8545;
  let forwarderAddress: EthAddress;
  let testERC20Address: EthAddress;

  beforeEach(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: 1, port: port++, log: false }));
    dateProvider = new TestDateProvider();
    cheatCodes = new EthCheatCodes([rpcUrl], dateProvider);
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKeyRaw = hdAccount.getHdKey().privateKey;
    if (!privKeyRaw) {
      throw new Error('Failed to get private key');
    }
    const privKey = bufferFrom(privKeyRaw).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);

    l1Client = createExtendedL1Client([rpcUrl], account, foundry);
    dateProvider = new TestDateProvider();

    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();

    // Deploy forwarder contract
    const forwarderDeployHash = await l1Client.deployContract({
      abi: FORWARDER_ABI,
      bytecode: FORWARDER_BYTECODE,
    });
    const forwarderReceipt = await l1Client.waitForTransactionReceipt({ hash: forwarderDeployHash });
    forwarderAddress = EthAddress.fromString(forwarderReceipt.contractAddress!);
    logger.debug(`Forwarder deployed at ${forwarderAddress.toString()}`);

    // Deploy TestERC20 contract
    const erc20DeployHash = await l1Client.deployContract({
      abi: TestERC20Abi,
      bytecode: TestERC20Bytecode,
      args: ['Test Token', 'TEST', l1Client.account.address],
    });
    const erc20Receipt = await l1Client.waitForTransactionReceipt({ hash: erc20DeployHash });
    testERC20Address = EthAddress.fromString(erc20Receipt.contractAddress!);
    logger.debug(`TestERC20 deployed at ${testERC20Address.toString()}`);

    // Add the forwarder as a minter so it can call mint on behalf of users
    const addMinterData = encodeFunctionData({
      abi: TestERC20Abi,
      functionName: 'addMinter',
      args: [forwarderAddress.toString()],
    });
    const addMinterHash = await l1Client.sendTransaction({
      to: testERC20Address.toString() as Hex,
      data: addMinterData,
    });
    await l1Client.waitForTransactionReceipt({ hash: addMinterHash });
    logger.debug(`Added forwarder as minter`);
  });

  afterEach(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 5000);

  it('wraps transactions through forwarder contract and emits events', async () => {
    const forwarderUtils = new ForwarderL1TxUtils(
      l1Client,
      EthAddress.fromString(l1Client.account.address),
      createViemSigner(l1Client),
      logger,
      dateProvider,
      {
        gasLimitBufferPercentage: 20,
        maxGwei: 500,
        maxSpeedUpAttempts: 3,
        checkIntervalMs: 100,
        stallTimeMs: 1000,
      },
      false,
      undefined,
      undefined,
      forwarderAddress,
    );

    // Create a transaction to mint tokens
    const mintAmount = 1000n;
    const recipient = l1Client.account.address;
    const mintCalldata = encodeFunctionData({
      abi: TestERC20Abi,
      functionName: 'mint',
      args: [recipient, mintAmount],
    });

    const request = {
      to: testERC20Address.toString() as Hex,
      data: mintCalldata,
      value: 0n,
      abi: TestERC20Abi,
    };

    // Send and monitor the transaction
    const { receipt } = await forwarderUtils.sendAndMonitorTransaction(request);

    // Verify the transaction was successful
    expect(receipt.status).toBe('success');

    // Verify the transaction went through the forwarder (the receipt's 'to' should be the forwarder address)
    expect(receipt.to?.toLowerCase()).toBe(forwarderAddress.toString().toLowerCase());

    // Verify transaction was actually sent
    expect(receipt.transactionHash).toBeDefined();
    expect(receipt.gasUsed).toBeGreaterThan(0n);

    // Parse and verify the Transfer event was emitted by the ERC20 contract
    const logs = parseEventLogs({
      abi: TestERC20Abi,
      logs: receipt.logs,
    });

    // Find the Transfer event (mint creates a Transfer from address(0))
    const transferEvent = logs.find(log => log.eventName === 'Transfer');
    expect(transferEvent).toBeDefined();
    expect(transferEvent!.args).toMatchObject({
      to: recipient,
      value: mintAmount,
    });
  }, 10_000);
});
