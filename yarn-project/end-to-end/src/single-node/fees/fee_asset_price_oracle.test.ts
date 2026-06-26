import type { Logger } from '@aztec/aztec.js/log';
import { EthCheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract, STATE_VIEW_ADDRESS } from '@aztec/ethereum/contracts';
import type { Anvil } from '@aztec/ethereum/test';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { getLogger, setup, startAnvil } from '../../fixtures/utils.js';
import { MockStateView, diffInBps } from '../../shared/mock_state_view.js';

// Covers the on-chain fee-asset price oracle convergence mechanism. Starts its own Anvil instance,
// deploys a MockStateView (etched at the real StateView address), then runs a single node with
// PIPELINING_SETUP_OPTS (prod seq, ethereumSlotDuration=4s, aztecSlotDuration=12s, minTxsPerBlock=0).
// Verifies that the rollup's getEthPerFeeAsset converges toward the oracle price across checkpoints
// via retryUntil polling.
describe('single-node/fees/fee_asset_price_oracle', () => {
  jest.setTimeout(15 * 60 * 1000);

  let logger: Logger;
  let teardown: () => Promise<void>;
  let anvil: Anvil;
  let rollup: RollupContract;
  let mockStateView: MockStateView;
  let ethCheatCodes: EthCheatCodes;

  // Beware, if you use "mainnet" here it will be completely broken due to blobs...
  const chain = foundry;
  // Convergence is gated by L1 checkpoint publication. Under real sequencer timing, a parent checkpoint can land late
  // and cause pipelined work to be rebuilt, so leave room for multiple checkpoint publications.
  const PRICE_CONVERGENCE_TIMEOUT_SECONDS = 240;
  const PRICE_CONVERGENCE_POLL_INTERVAL_SECONDS = 1;

  beforeAll(async () => {
    logger = getLogger();

    const anvilResult = await startAnvil({
      chainId: chain.id,
      l1BlockTime: PIPELINING_SETUP_OPTS.ethereumSlotDuration,
    });
    anvil = anvilResult.anvil;
    const rpcUrl = anvilResult.rpcUrl;

    // Set ETHEREUM_HOSTS so setup() uses our pre-started Anvil
    process.env.ETHEREUM_HOSTS = rpcUrl;

    // Deploy mock StateView BEFORE the full setup, so the oracle can read from it
    ethCheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());
    const account = mnemonicToAccount(MNEMONIC, { addressIndex: 999 });
    const walletClient = createExtendedL1Client([rpcUrl], account, chain);

    await ethCheatCodes.setBalance(account.address, 100n * 10n ** 18n);

    mockStateView = await MockStateView.deploy(ethCheatCodes, walletClient, STATE_VIEW_ADDRESS);
    logger.info(`Deployed mock StateView at ${STATE_VIEW_ADDRESS}`);

    // The initial oracle price (default value) is 1e7
    await mockStateView.setEthPerFeeAsset(10n ** 7n);

    await ethCheatCodes.mineEmptyBlock();
    await ethCheatCodes.mine(10);
    await ethCheatCodes.mineEmptyBlock();

    const context = await setup(0, { ...PIPELINING_SETUP_OPTS, l1ChainId: chain.id }, {}, chain);
    teardown = context.teardown;

    const l1Client = context.deployL1ContractsValues.l1Client;
    rollup = new RollupContract(l1Client, context.deployL1ContractsValues.l1ContractAddresses.rollupAddress);
  });

  afterAll(async () => {
    await teardown?.();
    await anvil?.stop().catch(err => logger.error('Failed to stop anvil', err));
    delete process.env.ETHEREUM_HOSTS;
  });

  // Sets the oracle price up 2.5% then polls rollup.getEthPerFeeAsset until it matches within 1 bps.
  // Then moves the oracle price down 0.5% and polls again. Asserts final price tracked both moves.
  it('on-chain price converges toward oracle price over multiple checkpoints', async () => {
    // Move the price up 2.5% (2 moves of 1% and another smaller)
    // Wait until we are within 1 bps or the price
    // Then move the price down 0.5%
    // Wait until 1 bps of the price
    // Profit

    const targetOraclePrice = (BigInt(10n ** 7n) * 1025n) / 1000n;
    await mockStateView.setEthPerFeeAsset(targetOraclePrice);
    logger.info(`Set uniswap price to ${targetOraclePrice}`);

    // Get initial on-chain price
    const initialOnChainPrice = await rollup.getEthPerFeeAsset();
    logger.info(`Initial on-chain price: ${initialOnChainPrice}, target oracle price: ${targetOraclePrice}`);

    // REFACTOR: hand-rolled retryUntil polling loop waiting for price convergence; a DSL helper for
    // "wait until rollup price is within N bps of oracle" would make the intent clearer.
    await retryUntil(
      async () => {
        const currentPrice = await rollup.getEthPerFeeAsset();
        logger.info(`Current on-chain price: ${currentPrice}, waiting for: ${targetOraclePrice}`);
        return diffInBps(currentPrice, targetOraclePrice) == 0n;
      },
      'price convergence toward oracle',
      PRICE_CONVERGENCE_TIMEOUT_SECONDS,
      PRICE_CONVERGENCE_POLL_INTERVAL_SECONDS,
    );

    const priceAfterFirstAlignment = await rollup.getEthPerFeeAsset();
    const targetOraclePrice2 = (BigInt(priceAfterFirstAlignment) * 995n) / 1000n;
    await mockStateView.setEthPerFeeAsset(targetOraclePrice2);
    logger.info(`Set uniswap price to ${targetOraclePrice2}`);

    // REFACTOR: second hand-rolled retryUntil polling loop for price convergence; same as above.
    await retryUntil(
      async () => {
        const currentPrice = await rollup.getEthPerFeeAsset();
        logger.info(`Current on-chain price: ${currentPrice}, waiting for: ${targetOraclePrice2}`);
        return diffInBps(currentPrice, targetOraclePrice2) == 0n;
      },
      'price convergence toward oracle',
      PRICE_CONVERGENCE_TIMEOUT_SECONDS,
      PRICE_CONVERGENCE_POLL_INTERVAL_SECONDS,
    );

    const finalPrice = await rollup.getEthPerFeeAsset();
    logger.info(`Final on-chain price: ${finalPrice}`);

    // Verify the price moved toward the oracle price
    expect(finalPrice).toBeGreaterThan(initialOnChainPrice);
    expect(diffInBps(finalPrice, targetOraclePrice2)).toBe(0n);
  });
});
