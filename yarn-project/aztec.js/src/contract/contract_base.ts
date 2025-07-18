import {
  type ContractArtifact,
  type FieldLayout,
  type FunctionAbi,
  FunctionSelector,
  getAllFunctionAbis,
} from '@aztec/stdlib/abi';
import { type ContractInstanceWithAddress, computePartialAddress } from '@aztec/stdlib/contract';

import type { Wallet } from '../wallet/wallet.js';
import { ContractFunctionInteraction } from './contract_function_interaction.js';

/**
 * Type representing a contract method that returns a ContractFunctionInteraction instance
 * and has a readonly 'selector' property of type Buffer. Takes any number of arguments.
 */
export type ContractMethod = ((...args: any[]) => ContractFunctionInteraction) & {
  /**
   * The unique identifier for a contract function in bytecode.
   */
  selector: () => Promise<FunctionSelector>;
};

/**
 * Type representing the storage layout of a contract.
 */
export type ContractStorageLayout<T extends string> = {
  [K in T]: FieldLayout;
};

/**
 * Abstract implementation of a contract extended by the Contract class and generated contract types.
 */
export class ContractBase {
  /**
   * An object containing contract methods mapped to their respective names.
   */
  public methods: { [name: string]: ContractMethod } = {};

  protected constructor(
    /** The deployed contract instance definition. */
    public readonly instance: ContractInstanceWithAddress,
    /** The Application Binary Interface for the contract. */
    public readonly artifact: ContractArtifact,
    /** The wallet used for interacting with this contract. */
    public wallet: Wallet,
  ) {
    getAllFunctionAbis(artifact).forEach((f: FunctionAbi) => {
      const interactionFunction = (...args: any[]) => {
        return new ContractFunctionInteraction(this.wallet, this.instance.address, f, args);
      };

      this.methods[f.name] = Object.assign(interactionFunction, {
        /**
         * A getter for users to fetch the function selector.
         * @returns Selector of the function.
         */
        selector() {
          return FunctionSelector.fromNameAndParameters(f.name, f.parameters);
        },
      });
    });
  }

  /** Address of the contract. */
  public get address() {
    return this.instance.address;
  }

  /** Partial address of the contract. */
  public get partialAddress() {
    return computePartialAddress(this.instance);
  }

  /**
   * Creates a new instance of the contract wrapper attached to a different wallet.
   * @param wallet - Wallet to use for sending txs.
   * @returns A new contract instance.
   */
  public withWallet(wallet: Wallet): this {
    return new ContractBase(this.instance, this.artifact, wallet) as this;
  }
}
