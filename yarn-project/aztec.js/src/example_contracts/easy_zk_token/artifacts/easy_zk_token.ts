/* eslint-disable */
import { ContractAbi } from '@aztec/foundation/abi';
import { Fr, Point } from '@aztec/foundation/fields';
import { AztecRPC, PublicKey } from '@aztec/types';

import {
  AztecAddress,
  ContractBase,
  ContractFunctionInteraction,
  ContractMethod,
  DeployMethod,
  Wallet,
} from '../../../index.js';
import EasyZkTokenJson from './easy_zk_token_contract.json' assert { type: 'json' };

const EasyZkTokenContractAbi = EasyZkTokenJson as ContractAbi;

/**
 * Type-safe interface for contract EasyZkToken;
 */
export class EasyZkTokenContract extends ContractBase {
  private constructor(
    /** The deployed contract's address. */
    address: AztecAddress,
    /** The wallet. */
    wallet: Wallet,
  ) {
    super(address, EasyZkTokenContractAbi, wallet);
  }

  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async create(
    /** The deployed contract's address. */
    address: AztecAddress,
    /** The wallet. */
    wallet: Wallet,
  ) {
    if (!(await wallet.isContractDeployed(address))) {
      throw new Error('Contract ' + address.toString() + ' is not deployed');
    }
    return new EasyZkTokenContract(address, wallet);
  }

  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(
    rpc: AztecRPC,
    initial_supply: bigint | number,
    owner: Fr | bigint | number | { toField: () => Fr },
  ) {
    return new DeployMethod<EasyZkTokenContract>(
      Point.ZERO,
      rpc,
      EasyZkTokenContractAbi,
      Array.from(arguments).slice(1),
    );
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public key to derive the address.
   */
  public static deployWithPublicKey(
    rpc: AztecRPC,
    publicKey: PublicKey,
    initial_supply: bigint | number,
    owner: Fr | bigint | number | { toField: () => Fr },
  ) {
    return new DeployMethod<EasyZkTokenContract>(
      publicKey,
      rpc,
      EasyZkTokenContractAbi,
      Array.from(arguments).slice(2),
    );
  }

  /**
   * Returns this contract's ABI.
   */
  public static get abi(): ContractAbi {
    return EasyZkTokenContractAbi;
  }

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public methods!: {
    /** compute_note_hash_and_nullifier(contract_address: field, nonce: field, storage_slot: field, preimage: array) */
    compute_note_hash_and_nullifier: ((
      contract_address: Fr | bigint | number | { toField: () => Fr },
      nonce: Fr | bigint | number | { toField: () => Fr },
      storage_slot: Fr | bigint | number | { toField: () => Fr },
      preimage: (Fr | bigint | number | { toField: () => Fr })[],
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;

    /** getBalance(owner: field) */
    getBalance: ((owner: Fr | bigint | number | { toField: () => Fr }) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;

    /** mint(amount: integer, owner: field) */
    mint: ((
      amount: bigint | number,
      owner: Fr | bigint | number | { toField: () => Fr },
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;

    /** transfer(amount: integer, sender: field, recipient: field) */
    transfer: ((
      amount: bigint | number,
      sender: Fr | bigint | number | { toField: () => Fr },
      recipient: Fr | bigint | number | { toField: () => Fr },
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, 'selector'>;
  };
}
