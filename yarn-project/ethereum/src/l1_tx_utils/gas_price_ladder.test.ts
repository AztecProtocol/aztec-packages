import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';

import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { createViemSigner } from './signer.js';
import { type L1TxRequest, L1TxTimeoutError } from './types.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const WEI_CONST = 1_000_000_000n;
const logger = createLogger('ethereum:test:gas-price-ladder');

const REQUEST: L1TxRequest = {
  to: '0x1234567890123456789012345678901234567890',
  data: '0x',
  value: 0n,
};

// Drives L1 time forward while keeping the pending tx in the mempool (mineEmptyBlock drops and re-adds
// it), so the monitor loop sees the tx stall, speeds it up, and eventually times it out.
async function runUntilTimeout(gasUtils: L1TxUtils, cheatCodes: EthCheatCodes): Promise<unknown> {
  let settled = false;
  const promise = gasUtils.sendAndMonitorTransaction(REQUEST).then(
    () => {
      settled = true;
      throw new Error('expected the transaction to time out');
    },
    (err: unknown) => {
      settled = true;
      return err;
    },
  );

  for (let i = 0; i < 20 && !settled; i++) {
    await sleep(300);
    await cheatCodes.mineEmptyBlock();
  }
  return promise;
}

describe('L1TxUtils gas-price ladder capture (integration)', () => {
  const initialBaseFee = WEI_CONST; // 1 gwei
  let l1Client: ExtendedViemWalletClient;
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let dateProvider: DateProvider;
  let port = 9645;

  const makeGasUtils = (config: Partial<L1TxUtilsConfig>) =>
    new L1TxUtils(
      l1Client,
      EthAddress.fromString(l1Client.account.address),
      createViemSigner(l1Client),
      logger,
      dateProvider,
      {
        checkIntervalMs: 100,
        stallTimeMs: 500,
        txTimeoutMs: 3000,
        cancelTxOnTimeout: false,
        // Keep the tx from being considered dropped while it sits pending across our empty blocks.
        txUnseenConsideredDroppedMs: 120_000,
        ...config,
      },
    );

  beforeEach(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ l1BlockTime: 1, port: port++, log: false }));
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
    const privKey = Buffer.from(hdAccount.getHdKey().privateKey!).toString('hex');
    const account = privateKeyToAccount(`0x${privKey}`);
    l1Client = createExtendedL1Client([rpcUrl], account, foundry);
    dateProvider = new DateProvider();

    await cheatCodes.setNextBlockBaseFeePerGas(initialBaseFee);
    await cheatCodes.evmMine();
    await cheatCodes.setAutomine(false);
    await cheatCodes.setIntervalMining(0);
  });

  afterEach(async () => {
    await cheatCodes.setIntervalMining(0);
    await anvil.stop().catch(err => createLogger('cleanup').error(err));
  }, 10_000);

  it('captures the escalating gas-price ladder and surfaces it on timeout when enabled', async () => {
    const gasUtils = makeGasUtils({ captureGasPriceHistory: true, maxSpeedUpAttempts: 3 });

    const err = await runUntilTimeout(gasUtils, cheatCodes);

    expect(err).toBeInstanceOf(L1TxTimeoutError);
    const { txState } = err as L1TxTimeoutError;

    // Initial send plus at least one speed-up.
    expect(txState.gasPriceHistory).toBeDefined();
    expect(txState.gasPriceHistory!.length).toBeGreaterThanOrEqual(2);

    // Priority fees strictly escalate across the ladder.
    const priorityFees = txState.gasPriceHistory!.map(g => g.maxPriorityFeePerGas);
    for (let i = 1; i < priorityFees.length; i++) {
      expect(priorityFees[i]).toBeGreaterThan(priorityFees[i - 1]);
    }

    // attempts == number of sent txs == ladder length; other snapshot fields are populated.
    expect(txState.attempts).toBe(txState.gasPriceHistory!.length);
    expect(txState.finalGasPrice.maxPriorityFeePerGas).toBe(priorityFees[priorityFees.length - 1]);
    expect(txState.gasLimit).toBeGreaterThan(0n);
    expect(txState.nonce).toBeGreaterThanOrEqual(0);

    gasUtils.interrupt();
    await gasUtils.waitMonitoringStopped(5);
  }, 40_000);

  it('does not retain the ladder when disabled, but still throws an L1TxTimeoutError', async () => {
    const gasUtils = makeGasUtils({ captureGasPriceHistory: false, maxSpeedUpAttempts: 3 });

    const err = await runUntilTimeout(gasUtils, cheatCodes);

    // Subclass relationship must hold so the publish path keeps treating it as a timeout.
    expect(err).toBeInstanceOf(L1TxTimeoutError);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as L1TxTimeoutError).txState.gasPriceHistory).toBeUndefined();

    gasUtils.interrupt();
    await gasUtils.waitMonitoringStopped(5);
  }, 40_000);
});
