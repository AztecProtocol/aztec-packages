---
title: How to Compile a Contract
sidebar_position: 3
tags: [contracts]
---

Once you have written a contract in Aztec.nr, you will need to compile it into an artifact in order to use it.

In this guide we will cover how to do so, both using the `aztec-nargo` command and programmatically.

We'll also cover how to generate a helper [TypeScript interface](#typescript-interfaces) and an [Aztec.nr interface](#noir-interfaces) for easily interacting with your contract from your typescript app and from other Aztec.nr contracts, respectively.

## Compile using aztec-nargo

To compile a contract using the Aztec's build of nargo.

Run the `aztec-nargo compile` command within your contract project folder (the one that contains the `Nargo.toml` file):

```bash
aztec-nargo compile
```

This will output a JSON artifact for each contract in the project to a `target` folder containing the Noir ABI artifacts.

:::note
This command looks for `Nargo.toml` files by ascending up the parent directories, and will compile the top-most Nargo.toml file it finds.
Eg: if you are in `/hobbies/cool-game/contracts/easter-egg/`, and both `cool-game` and `easter-egg` contain a Nargo.toml file, then `aztec-nargo compile` will be performed on `cool-game/Nargo.toml` and compile the project(s) specified within it. Eg

```
[workspace]
members = [
    "contracts/easter-egg",
]
```

:::

### Typescript Interfaces

You can use the code generator to autogenerate type-safe typescript classes for each of your contracts. These classes define type-safe methods for deploying and interacting with your contract based on their artifact.

```bash
aztec codegen ./aztec-nargo/output/target/path -o src/artifacts
```

Below is typescript code generated from the example [Token contract (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_contract/src/main.nr) contract:

```ts showLineNumbers
export type Transfer = {
  from: AztecAddressLike;
  to: AztecAddressLike;
  amount: FieldLike;
};

/**
 * Type-safe interface for contract Token;
 */
export class TokenContract extends ContractBase {
  private constructor(instance: ContractInstanceWithAddress, wallet: Wallet) {
    super(instance, TokenContractArtifact, wallet);
  }

  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async at(address: AztecAddress, wallet: Wallet) {
    return Contract.at(
      address,
      TokenContract.artifact,
      wallet
    ) as Promise<TokenContract>;
  }

  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(
    wallet: Wallet,
    admin: AztecAddressLike,
    name: string,
    symbol: string,
    decimals: bigint | number
  ) {
    return new DeployMethod<TokenContract>(
      PublicKeys.default(),
      wallet,
      TokenContractArtifact,
      TokenContract.at,
      Array.from(arguments).slice(1)
    );
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  public static deployWithPublicKeys(
    publicKeys: PublicKeys,
    wallet: Wallet,
    admin: AztecAddressLike,
    name: string,
    symbol: string,
    decimals: bigint | number
  ) {
    return new DeployMethod<TokenContract>(
      publicKeys,
      wallet,
      TokenContractArtifact,
      TokenContract.at,
      Array.from(arguments).slice(2)
    );
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  public static deployWithOpts<M extends keyof TokenContract["methods"]>(
    opts: { publicKeys?: PublicKeys; method?: M; wallet: Wallet },
    ...args: Parameters<TokenContract["methods"][M]>
  ) {
    return new DeployMethod<TokenContract>(
      opts.publicKeys ?? PublicKeys.default(),
      opts.wallet,
      TokenContractArtifact,
      TokenContract.at,
      Array.from(arguments).slice(1),
      opts.method ?? "constructor"
    );
  }

  /**
   * Returns this contract's artifact.
   */
  public static get artifact(): ContractArtifact {
    return TokenContractArtifact;
  }

  public static get storage(): ContractStorageLayout<
    | "admin"
    | "minters"
    | "balances"
    | "total_supply"
    | "public_balances"
    | "symbol"
    | "name"
    | "decimals"
  > {
    return {
      admin: {
        slot: new Fr(1n),
      },
      minters: {
        slot: new Fr(2n),
      },
      balances: {
        slot: new Fr(3n),
      },
      total_supply: {
        slot: new Fr(4n),
      },
      public_balances: {
        slot: new Fr(5n),
      },
      symbol: {
        slot: new Fr(6n),
      },
      name: {
        slot: new Fr(7n),
      },
      decimals: {
        slot: new Fr(8n),
      },
    } as ContractStorageLayout<
      | "admin"
      | "minters"
      | "balances"
      | "total_supply"
      | "public_balances"
      | "symbol"
      | "name"
      | "decimals"
    >;
  }

  public static get notes(): ContractNotes<"UintNote"> {
    return {
      UintNote: {
        id: new NoteSelector(202136239),
      },
    } as ContractNotes<"UintNote">;
  }

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public declare methods: {
    /** balance_of_private(owner: struct) */
    balance_of_private: ((
      owner: AztecAddressLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** balance_of_public(owner: struct) */
    balance_of_public: ((
      owner: AztecAddressLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** burn_private(from: struct, amount: field, nonce: field) */
    burn_private: ((
      from: AztecAddressLike,
      amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** burn_public(from: struct, amount: field, nonce: field) */
    burn_public: ((
      from: AztecAddressLike,
      amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** cancel_authwit(inner_hash: field) */
    cancel_authwit: ((inner_hash: FieldLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** compute_note_hash_and_optionally_a_nullifier(contract_address: struct, nonce: field, storage_slot: field, note_type_id: field, compute_nullifier: boolean, serialized_note: array) */
    compute_note_hash_and_optionally_a_nullifier: ((
      contract_address: AztecAddressLike,
      nonce: FieldLike,
      storage_slot: FieldLike,
      note_type_id: FieldLike,
      compute_nullifier: boolean,
      serialized_note: FieldLike[]
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** constructor(admin: struct, name: string, symbol: string, decimals: integer) */
    constructor: ((
      admin: AztecAddressLike,
      name: string,
      symbol: string,
      decimals: bigint | number
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** finalize_mint_to_private(amount: field, hiding_point_slot: field) */
    finalize_mint_to_private: ((
      amount: FieldLike,
      hiding_point_slot: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** finalize_transfer_to_private(amount: field, hiding_point_slot: field) */
    finalize_transfer_to_private: ((
      amount: FieldLike,
      hiding_point_slot: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** get_admin() */
    get_admin: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** is_minter(minter: struct) */
    is_minter: ((minter: AztecAddressLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** mint_to_private(from: struct, to: struct, amount: field) */
    mint_to_private: ((
      from: AztecAddressLike,
      to: AztecAddressLike,
      amount: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** mint_to_public(to: struct, amount: field) */
    mint_to_public: ((
      to: AztecAddressLike,
      amount: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** prepare_transfer_to_private(to: struct) */
    prepare_transfer_to_private: ((
      to: AztecAddressLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** private_get_decimals() */
    private_get_decimals: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** private_get_name() */
    private_get_name: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** private_get_symbol() */
    private_get_symbol: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** public_dispatch(selector: field) */
    public_dispatch: ((selector: FieldLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** public_get_decimals() */
    public_get_decimals: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** public_get_name() */
    public_get_name: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** public_get_symbol() */
    public_get_symbol: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** set_admin(new_admin: struct) */
    set_admin: ((new_admin: AztecAddressLike) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** set_minter(minter: struct, approve: boolean) */
    set_minter: ((
      minter: AztecAddressLike,
      approve: boolean
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** setup_refund(fee_payer: struct, user: struct, funded_amount: field, nonce: field) */
    setup_refund: ((
      fee_payer: AztecAddressLike,
      user: AztecAddressLike,
      funded_amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** total_supply() */
    total_supply: (() => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** transfer(to: struct, amount: field) */
    transfer: ((
      to: AztecAddressLike,
      amount: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** transfer_in_private(from: struct, to: struct, amount: field, nonce: field) */
    transfer_in_private: ((
      from: AztecAddressLike,
      to: AztecAddressLike,
      amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** transfer_in_public(from: struct, to: struct, amount: field, nonce: field) */
    transfer_in_public: ((
      from: AztecAddressLike,
      to: AztecAddressLike,
      amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** transfer_to_private(to: struct, amount: field) */
    transfer_to_private: ((
      to: AztecAddressLike,
      amount: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;

    /** transfer_to_public(from: struct, to: struct, amount: field, nonce: field) */
    transfer_to_public: ((
      from: AztecAddressLike,
      to: AztecAddressLike,
      amount: FieldLike,
      nonce: FieldLike
    ) => ContractFunctionInteraction) &
      Pick<ContractMethod, "selector">;
  };

  public static get events(): {
    Transfer: {
      abiType: AbiType;
      eventSelector: EventSelector;
      fieldNames: string[];
    };
  } {
    return {
      Transfer: {
        abiType: {
          fields: [
            {
              name: "from",
              type: {
                fields: [
                  {
                    name: "inner",
                    type: {
                      kind: "field",
                    },
                  },
                ],
                kind: "struct",
                path: "authwit::aztec::protocol_types::address::aztec_address::AztecAddress",
              },
            },
            {
              name: "to",
              type: {
                fields: [
                  {
                    name: "inner",
                    type: {
                      kind: "field",
                    },
                  },
                ],
                kind: "struct",
                path: "authwit::aztec::protocol_types::address::aztec_address::AztecAddress",
              },
            },
            {
              name: "amount",
              type: {
                kind: "field",
              },
            },
          ],
          kind: "struct",
          path: "Token::Transfer",
        },
        eventSelector: EventSelector.fromSignature(
          "Transfer((Field),(Field),Field)"
        ),
        fieldNames: ["from", "to", "amount"],
      },
    };
  }
}
```

Read more about interacting with contracts using `aztec.js` [by following this tutorial](../../../tutorials/codealong/aztecjs-getting-started).

### Aztec.nr interfaces

An Aztec.nr contract can [call a function](./writing_contracts/call_functions.md) in another contract via `context.call_private_function` or `context.call_public_function`. However, this requires manually assembling the function selector and manually serializing the arguments, which is not type-safe.

To make this easier, the compiler automatically generates interface structs that expose a convenience method for each function listed in a given contract artifact. These structs are intended to be used from another contract project that calls into the current one.

Below is an example of interface usage generated from the [Token (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/token_contract/src/main.nr) contract, used from the [FPC (GitHub link)](https://github.com/AztecProtocol/aztec-packages/blob/master/noir-projects/noir-contracts/contracts/fpc_contract/src/main.nr):

```rust
contract FPC {

    ...

    use dep::token::Token;

    ...


   #[private]
    fn fee_entrypoint_private(amount: Field, asset: AztecAddress, secret_hash: Field, nonce: Field) {
        assert(asset == storage.other_asset.read());
        Token::at(asset).transfer_to_public(context.msg_sender(), context.this_address(), amount, nonce).call(&mut context);
        FPC::at(context.this_address()).pay_fee_with_shielded_rebate(amount, asset, secret_hash).enqueue(&mut context);
    }

    #[private]
    fn fee_entrypoint_public(amount: Field, asset: AztecAddress, nonce: Field) {
        FPC::at(context.this_address()).prepare_fee(context.msg_sender(), amount, asset, nonce).enqueue(&mut context);
        FPC::at(context.this_address()).pay_fee(context.msg_sender(), amount, asset).enqueue(&mut context);
    }

    ...

}
```

Read more about how to use the Aztec.nr interfaces [here](../../../aztec/smart_contracts/functions/index.md).

:::info
At the moment, the compiler generates these interfaces from already compiled ABIs, and not from source code. This means that you should not import a generated interface from within the same project as its source contract, or you risk circular references.
:::

## Next steps

Once you have compiled your contracts, you can use the generated artifacts via the `Contract` class in the `aztec.js` package to deploy and interact with them, or rely on the type-safe typescript classes directly.
