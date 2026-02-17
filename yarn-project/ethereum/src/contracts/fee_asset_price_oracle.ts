import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { type Hex, encodeAbiParameters, getContract, keccak256, parseAbiParameters } from 'viem';

import type { ViemClient } from '../types.js';
import { RollupContract } from './rollup.js';

/** Maximum price modifier per checkpoint in basis points. ±100 bps = ±1% */
export const MAX_FEE_ASSET_PRICE_MODIFIER_BPS = 100n;

/**
 * Validates that a fee asset price modifier is within the allowed range.
 * Validators should call this before attesting to a checkpoint proposal.
 *
 * @param modifier - The fee asset price modifier in basis points
 * @returns true if the modifier is valid (between -100 and +100 bps)
 */
export function validateFeeAssetPriceModifier(modifier: bigint): boolean {
  return modifier >= -MAX_FEE_ASSET_PRICE_MODIFIER_BPS && modifier <= MAX_FEE_ASSET_PRICE_MODIFIER_BPS;
}

/**
 * Oracle for computing fee asset price modifiers based on Uniswap V4 pool prices.
 * Only active on Ethereum mainnet - returns 0 on other chains.
 */
export class FeeAssetPriceOracle {
  constructor(
    private client: ViemClient,
    private readonly rollupContract: RollupContract,
    private log: Logger = createLogger('fee-asset-price-oracle'),
  ) {}

  @memoize
  async getUniswapOracle(): Promise<UniswapPriceOracle | undefined> {
    const code = await this.client.getCode({ address: STATE_VIEW_ADDRESS.toString() });
    if (code === undefined || code === '0x') {
      this.log.warn('Uniswap V4 StateView contract not found, skipping fee asset price oracle');
      return undefined;
    }
    this.log.info('Uniswap V4 StateView contract found, initializing fee asset price oracle');
    const oracle = new UniswapPriceOracle(this.client, this.log);

    try {
      if (!(await oracle.isPoolInitialized())) {
        this.log.warn('Uniswap V4 pool not initialized, skipping fee asset price oracle');
        return undefined;
      }
    } catch (err) {
      this.log.warn(`Failed to check if Uniswap V4 pool is initialized: ${err}`);
      return undefined;
    }

    return oracle;
  }

  /**
   * Computes the fee asset price modifier to be used in the next checkpoint proposal.
   *
   * The modifier adjusts the on-chain fee asset price toward the oracle price,
   * clamped to ±1% (±100 basis points) per checkpoint.
   *
   * Returns 0 if not on mainnet or if the oracle query fails.
   *
   * @returns The price modifier in basis points (positive to increase price, negative to decrease)
   */
  async computePriceModifier(): Promise<bigint> {
    const uniswapOracle = await this.getUniswapOracle();
    if (!uniswapOracle) {
      return 0n;
    }

    try {
      // Get current on-chain price (ETH per fee asset, E12)
      const currentPriceE12 = await this.rollupContract.getEthPerFeeAsset();

      // Get oracle price (median of last N blocks, ETH per fee asset, E12)
      const oraclePriceE12 = await uniswapOracle.getMeanEthPerFeeAssetE12();

      // Compute modifier in basis points
      const modifier = this.computePriceModifierBps(currentPriceE12, oraclePriceE12);

      this.log.debug('Computed price modifier', {
        currentPriceE12: currentPriceE12.toString(),
        oraclePriceE12: oraclePriceE12.toString(),
        modifierBps: modifier.toString(),
      });

      return modifier;
    } catch (err) {
      this.log.warn(`Failed to compute price modifier, using 0: ${err}`);
      return 0n;
    }
  }

  /**
   * Gets the current oracle price (ETH per fee asset, scaled by 1e12).
   * Returns undefined if not on mainnet or if the oracle query fails.
   */
  async getOraclePrice(): Promise<bigint | undefined> {
    const uniswapOracle = await this.getUniswapOracle();
    if (!uniswapOracle) {
      return undefined;
    }

    try {
      return await uniswapOracle.getMeanEthPerFeeAssetE12();
    } catch (err) {
      this.log.warn(`Failed to get oracle price: ${err}`);
      return undefined;
    }
  }

  /**
   * Computes the basis points modifier needed to move from current price toward target price.
   *
   * @param currentPrice - Current ETH per fee asset (E12 scale)
   * @param targetPrice - Target ETH per fee asset (E12 scale)
   * @returns Basis points modifier clamped to ±100 (±1%)
   */
  computePriceModifierBps(currentPrice: bigint, targetPrice: bigint): bigint {
    if (currentPrice === 0n) {
      return MAX_FEE_ASSET_PRICE_MODIFIER_BPS;
    }

    // Calculate percentage difference in basis points
    // modifierBps = ((targetPrice - currentPrice) / currentPrice) * 10000
    const diff = targetPrice - currentPrice;
    const rawModifierBps = (diff * 10_000n) / currentPrice;

    // Clamp to ±MAX_FEE_ASSET_PRICE_MODIFIER_BPS
    if (rawModifierBps > MAX_FEE_ASSET_PRICE_MODIFIER_BPS) {
      return MAX_FEE_ASSET_PRICE_MODIFIER_BPS;
    }
    if (rawModifierBps < -MAX_FEE_ASSET_PRICE_MODIFIER_BPS) {
      return -MAX_FEE_ASSET_PRICE_MODIFIER_BPS;
    }
    return rawModifierBps;
  }
}

/** Mainnet Uniswap V4 StateView contract address */
export const STATE_VIEW_ADDRESS = EthAddress.fromString('0x7ffe42c4a5deea5b0fec41c94c136cf115597227');

const PRECISION_Q192 = 10n ** 12n * 2n ** 192n;

/**
 * Converts Uniswap's sqrtPriceX96 directly to ETH per FeeAsset (E12).
 *
 * For an ETH/FeeAsset pool where ETH is currency0 and FeeAsset is currency1:
 * - Uniswap's sqrtPriceX96 = sqrt(FeeAsset/ETH) * 2^96
 * - We need: ETH/FeeAsset with 1e12 precision
 *
 * Math:
 *   price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192  (FeeAsset per ETH)
 *   ethPerFeeAsset = 1 / price = 2^192 / sqrtPriceX96^2
 *   ethPerFeeAssetE12 = ethPerFeeAsset * 1e12 = 1e12 * 2^192 / sqrtPriceX96^2
 */
export function sqrtPriceX96ToEthPerFeeAssetE12(sqrtPriceX96: bigint): bigint {
  if (sqrtPriceX96 === 0n) {
    throw new Error('Cannot convert zero sqrtPriceX96');
  }
  return PRECISION_Q192 / (sqrtPriceX96 * sqrtPriceX96);
}
/**
 * Uniswap V4 StateView ABI - only the functions we need
 */
const StateViewAbi = [
  {
    type: 'function',
    name: 'getSlot0',
    inputs: [{ name: 'poolId', type: 'bytes32', internalType: 'PoolId' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160', internalType: 'uint160' },
      { name: 'tick', type: 'int24', internalType: 'int24' },
      { name: 'protocolFee', type: 'uint24', internalType: 'uint24' },
      { name: 'lpFee', type: 'uint24', internalType: 'uint24' },
    ],
    stateMutability: 'view',
  },
] as const;

/**
 * Client for querying the ETH/FeeAsset price from Uniswap V4.
 * Returns prices in ETH per FeeAsset format (E12) to match the rollup contract.
 */
class UniswapPriceOracle {
  private readonly stateView;
  private readonly poolId: Hex;
  private readonly log: Logger;

  constructor(
    private readonly client: ViemClient,
    log?: Logger,
  ) {
    this.log = log ?? createLogger('uniswap-price-oracle');
    this.stateView = getContract({
      address: STATE_VIEW_ADDRESS.toString(),
      abi: StateViewAbi,
      client,
    });
    this.poolId = this.computePoolId();
    this.log.debug(`Initialized UniswapPriceOracle with poolId: ${this.poolId}`);
  }

  /**
   * Computes the PoolId from the pool configuration by hashing its components.
   * PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
   * For mainnet, the value is expected to be: 0xce2899b16743cfd5a954d8122d5e07f410305b1aebee39fd73d9f3b9ebf10c2f
   * Derived anyway to make it simpler to change if needed.
   */
  @memoize
  computePoolId(): Hex {
    /** ETH/FeeAsset pool configuration (hardcoded for mainnet) */
    const encoded = encodeAbiParameters(parseAbiParameters('address, address, uint24, int24, address'), [
      EthAddress.ZERO.toString(),
      EthAddress.fromString('0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2').toString(),
      500, // 0.05%
      10,
      EthAddress.fromString('0xd53006d1e3110fD319a79AEEc4c527a0d265E080').toString(),
    ]);
    return keccak256(encoded);
  }

  async isPoolInitialized(): Promise<boolean> {
    const [sqrtPriceX96] = await this.stateView.read.getSlot0([this.poolId], undefined);
    return sqrtPriceX96 !== 0n;
  }

  /**
   * Gets the price as ETH per FeeAsset, scaled by 1e12.
   * This is the format expected by the rollup contract.
   *
   * @param blockNumber - Optional block number to query at (defaults to latest)
   */
  async getEthPerFeeAssetE12(blockNumber?: bigint): Promise<bigint> {
    const [sqrtPriceX96] = await this.stateView.read.getSlot0(
      [this.poolId],
      blockNumber !== undefined ? { blockNumber } : undefined,
    );
    return sqrtPriceX96ToEthPerFeeAssetE12(sqrtPriceX96);
  }

  /**
   * Gets the median price over the last N blocks as ETH per FeeAsset (E12).
   * Using median helps protect against single-block manipulation.
   *
   * @param numBlocks - Number of recent blocks to sample (default: 5)
   * @returns Median price as ETH per FeeAsset, scaled by 1e12
   */
  async getMeanEthPerFeeAssetE12(numBlocks: number = 5): Promise<bigint> {
    const currentBlock = await this.client.getBlockNumber();
    const prices: bigint[] = [];

    for (let i = 0; i < numBlocks; i++) {
      const blockNumber = currentBlock - BigInt(i);
      if (blockNumber < 0n) {
        break;
      }

      try {
        const price = await this.getEthPerFeeAssetE12(blockNumber);
        prices.push(price);
      } catch (err) {
        this.log.warn(`Failed to get price at block ${blockNumber}: ${err}`);
        // Continue with fewer samples
      }
    }

    const filteredPrices = prices.filter(price => price !== 0n);

    if (filteredPrices.length === 0) {
      throw new Error('Failed to get any price samples from Uniswap oracle');
    }

    const mean = filteredPrices.reduce((a, b) => a + b, 0n) / BigInt(filteredPrices.length);
    return mean;
  }
}
