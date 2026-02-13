import { EthAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import type { EthCheatCodes } from '@aztec/aztec/testing';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';

import { getContract } from 'viem';

/**
 * Mock StateView contract for testing the Uniswap price oracle.
 *
 * Wraps a compiled Solidity contract that mimics the Uniswap V4 StateView's getSlot0 function.
 * The mock allows setting return values dynamically for testing different price scenarios.
 *
 * Solidity source:
 * ```solidity
 * // SPDX-License-Identifier: Apache-2.0
 * pragma solidity >=0.8.27;
 *
 * contract MockStateView {
 *     uint160 public sqrtPriceX96;
 *     int24 public tick;
 *     uint24 public protocolFee;
 *     uint24 public lpFee;
 *
 *     function setReturnValues(
 *         uint160 _sqrtPriceX96,
 *         int24 _tick,
 *         uint24 _protocolFee,
 *         uint24 _lpFee
 *     ) external {
 *         sqrtPriceX96 = _sqrtPriceX96;
 *         tick = _tick;
 *         protocolFee = _protocolFee;
 *         lpFee = _lpFee;
 *     }
 *
 *     function getSlot0(bytes32 poolId) external view returns (uint160, int24, uint24, uint24) {
 *         return (sqrtPriceX96, tick, protocolFee, lpFee);
 *     }
 * }
 * ```
 */
export class MockStateView {
  private static readonly BYTECODE: `0x${string}` =
    '0x608060405234801561000f575f5ffd5b5060043610610060575f3560e01c80633eaf5d9f14610064578063704ce43e146100825780638db791d2146100a0578063b0e21e8a146100be578063b52e4bdd146100dc578063c815641c146100f8575b5f5ffd5b61006c61012b565b60405161007991906102ab565b60405180910390f35b61008a61013d565b60405161009791906102e1565b60405180910390f35b6100a8610151565b6040516100b59190610328565b60405180910390f35b6100c6610175565b6040516100d391906102e1565b60405180910390f35b6100f660048036038101906100f191906103c3565b610189565b005b610112600480360381019061010d919061045a565b61022b565b6040516101229493929190610485565b60405180910390f35b5f60149054906101000a900460020b81565b5f601a9054906101000a900462ffffff1681565b5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f60179054906101000a900462ffffff1681565b835f5f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550825f60146101000a81548162ffffff021916908360020b62ffffff160217905550815f60176101000a81548162ffffff021916908362ffffff160217905550805f601a6101000a81548162ffffff021916908362ffffff16021790555050505050565b5f5f5f5f5f5f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff165f60149054906101000a900460020b5f60179054906101000a900462ffffff165f601a9054906101000a900462ffffff1693509350935093509193509193565b5f8160020b9050919050565b6102a581610290565b82525050565b5f6020820190506102be5f83018461029c565b92915050565b5f62ffffff82169050919050565b6102db816102c4565b82525050565b5f6020820190506102f45f8301846102d2565b92915050565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b610322816102fa565b82525050565b5f60208201905061033b5f830184610319565b92915050565b5f5ffd5b61034e816102fa565b8114610358575f5ffd5b50565b5f8135905061036981610345565b92915050565b61037881610290565b8114610382575f5ffd5b50565b5f813590506103938161036f565b92915050565b6103a2816102c4565b81146103ac575f5ffd5b50565b5f813590506103bd81610399565b92915050565b5f5f5f5f608085870312156103db576103da610341565b5b5f6103e88782880161035b565b94505060206103f987828801610385565b935050604061040a878288016103af565b925050606061041b878288016103af565b91505092959194509250565b5f819050919050565b61043981610427565b8114610443575f5ffd5b50565b5f8135905061045481610430565b92915050565b5f6020828403121561046f5761046e610341565b5b5f61047c84828501610446565b91505092915050565b5f6080820190506104985f830187610319565b6104a5602083018661029c565b6104b260408301856102d2565b6104bf60608301846102d2565b9594505050505056fea2646970667358221220f8b1bfff284535bc078368ed34bd5e78981644845f3c9c1f5a4b8448c976805464736f6c634300081f0033';
  private static readonly ABI = [
    {
      type: 'function',
      name: 'setReturnValues',
      inputs: [
        { name: '_sqrtPriceX96', type: 'uint160' },
        { name: '_tick', type: 'int24' },
        { name: '_protocolFee', type: 'uint24' },
        { name: '_lpFee', type: 'uint24' },
      ],
      outputs: [],
      stateMutability: 'nonpayable',
    },
    {
      inputs: [
        {
          internalType: 'bytes32',
          name: 'poolId',
          type: 'bytes32',
        },
      ],
      name: 'getSlot0',
      outputs: [
        {
          internalType: 'uint160',
          name: '',
          type: 'uint160',
        },
        {
          internalType: 'int24',
          name: '',
          type: 'int24',
        },
        {
          internalType: 'uint24',
          name: '',
          type: 'uint24',
        },
        {
          internalType: 'uint24',
          name: '',
          type: 'uint24',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  private constructor(
    private readonly address: EthAddress,
    private readonly walletClient: ExtendedViemWalletClient,
    private readonly log: Logger = createLogger('mock-state-view'),
  ) {}

  /**
   * Deploys the mock StateView contract at the specified address using etch.
   * @param ethCheatCodes - Cheat codes for etching bytecode
   * @param walletClient - Wallet client for sending transactions
   * @param address - Address to deploy the mock at (typically the real StateView address)
   */
  static async deploy(
    ethCheatCodes: EthCheatCodes,
    walletClient: ExtendedViemWalletClient,
    address: EthAddress,
  ): Promise<MockStateView> {
    await ethCheatCodes.etch(address, MockStateView.BYTECODE);
    return new MockStateView(address, walletClient);
  }

  /**
   * Sets the price using the ethPerFeeAssetE12 format (same as rollup contract).
   * Computes the corresponding sqrtPriceX96 internally.
   *
   * Math (from fee_asset_price_oracle.ts):
   *   ethPerFeeAssetE12 = 1e12 * 2^192 / sqrtPriceX96^2
   *
   * Inverted:
   *   sqrtPriceX96^2 = 1e12 * 2^192 / ethPerFeeAssetE12
   *   sqrtPriceX96 = sqrt(1e12 * 2^192 / ethPerFeeAssetE12)
   *
   * @param ethPerFeeAssetE12 - The price in ETH per fee asset, scaled by 1e12
   */
  async setEthPerFeeAsset(ethPerFeeAssetE12: bigint) {
    const sqrtPriceX96 = this.ethPerFeeAssetE12ToSqrtPriceX96(ethPerFeeAssetE12);
    return await this.setSqrtPriceX96(sqrtPriceX96);
  }

  /**
   * Sets the sqrtPriceX96 value directly (Uniswap's price encoding).
   * @param sqrtPriceX96 - The sqrtPriceX96 value
   * @param tick - The tick value (default 10)
   * @param protocolFee - The protocol fee (default 0)
   * @param lpFee - The LP fee (default 500)
   */
  async setSqrtPriceX96(sqrtPriceX96: bigint, tick: number = 10, protocolFee: number = 0, lpFee: number = 500) {
    const contract = getContract({
      address: this.address.toString() as `0x${string}`,
      abi: MockStateView.ABI,
      client: this.walletClient,
    });

    const hash = await contract.write.setReturnValues([sqrtPriceX96, tick, protocolFee, lpFee]);
    this.log.info(`Set sqrtPriceX96 to ${sqrtPriceX96}`);
    return await this.walletClient.waitForTransactionReceipt({ hash });
  }

  /**
   * Converts ethPerFeeAssetE12 to sqrtPriceX96 (inverse of sqrtPriceX96ToEthPerFeeAssetE12).
   *
   * Math:
   *   sqrtPriceX96 = sqrt(1e12 * 2^192 / ethPerFeeAssetE12)
   */
  ethPerFeeAssetE12ToSqrtPriceX96(ethPerFeeAssetE12: bigint): bigint {
    if (ethPerFeeAssetE12 === 0n) {
      throw new Error('Cannot convert zero ethPerFeeAssetE12');
    }
    const Q192 = 2n ** 192n;
    const sqrtPriceSquared = (10n ** 12n * Q192) / ethPerFeeAssetE12;
    return this.bigintSqrt(sqrtPriceSquared);
  }

  /** Integer square root using Newton's method */
  bigintSqrt(n: bigint): bigint {
    if (n < 0n) {
      throw new Error('Cannot compute sqrt of negative number');
    }
    if (n === 0n) {
      return 0n;
    }
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }
    return x;
  }
}

export function diffInBps(a: bigint, b: bigint): bigint {
  return ((a - b) * 10000n) / b;
}
