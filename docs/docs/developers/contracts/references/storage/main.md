
## Map

A `map` is a state variable that "maps" a key to a value. It can be used with private or public storage variables.

:::info
In Aztec.nr, keys are always `Field`s, or types that can be serialized as Fields, and values can be any type - even other maps. `Field`s are finite field elements, but you can think of them as integers.
:::

It includes a [`Context`](../context.mdx) to specify the private or public domain, a `storage_slot` to specify where in storage the map is stored, and a `start_var_constructor` which tells the map how it should operate on the underlying type. This includes how to serialize and deserialize the type, as well as how commitments and nullifiers are computed for the type if it's private.

You can view the implementation in the Aztec.nr library [here](https://github.com/AztecProtocol/aztec-packages/blob/master/yarn-project/aztec-nr/aztec/src/state_vars/map.nr).

### `new`

When declaring the storage for a map, we use the `Map::new()` constructor. As seen below, this takes the `storage_slot` and the `start_var_constructor` along with the [`Context`](../context.mdx).

We will see examples of map constructors for public and private variables in later sections.

#### As private storage

When declaring a mapping in private storage, we have to specify which type of Note to use. In the example below, we are specifying that we want to use the `Singleton` note type.

In the Storage struct:

#include_code storage-map-singleton-declaration /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

In the `Storage::init` function:

#include_code state_vars-MapSingleton /yarn-project/noir-contracts/contracts/docs_example_contract/src/main.nr rust

#### Public Example

When declaring a public mapping in Storage, we have to specify that the type is public by declaring it as `PublicState` instead of specifying a note type like with private storage above.

In the Storage struct:

#include_code storage_minters /yarn-project/noir-contracts/contracts/token_contract/src/main.nr rust

In the `Storage::init` function:

#include_code storage_minters_init /yarn-project/noir-contracts/contracts/token_contract/src/main.nr rust

### `at`

When dealing with a Map, we can access the value at a given key using the `::at` method. This takes the key as an argument and returns the value at that key.

This function behaves similarly for both private and public maps. An example could be if we have a map with `minters`, which is mapping addresses to a flag for whether they are allowed to mint tokens or not.

#include_code read_minter /yarn-project/noir-contracts/contracts/token_contract/src/main.nr rust

Above, we are specifying that we want to get the storage in the Map `at` the `msg_sender()`, read the value stored and check that `msg_sender()` is indeed a minter. Doing a similar operation in Solidity code would look like:

```solidity
require(minters[msg.sender], "caller is not minter");
```

## Further Reading

- Managing [Public State](./public_state.md)
- Jump to the page on [Private State](./private_state.md)

## Concepts mentioned

- [Hybrid State Model](../../../../learn/concepts/hybrid_state/main.md)
- [Public-private execution](../../../../learn/concepts/communication/public_private_calls/main.md)
- [Function Contexts](../context.mdx)
