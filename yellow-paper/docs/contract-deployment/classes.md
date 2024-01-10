# Contract classes

A contract class is a collection of state variable declarations, and related unconstrained, private, and public functions. Contract classes don't have any initialized state, they just define code. A contract class cannot be called; only a contract instance can be called.

## Rationale

Contract classes simplify the process of reusing code by enshrining implementations as a first-class citizen at the protocol. Given multiple [contract instances](./instances.md) that rely on the same class, the class needs to be declared only once, reducing the deployment cost for all contract instances. Classes also simplify the process of upgradeability; classes decouple state from code, making it easier for an instance to switch to different code while retaining its state.

:::info
Read the following discussions for additional context:

- [Abstracting contract deployment](https://forum.aztec.network/t/proposal-abstracting-contract-deployment/2576)
- [Implementing contract upgrades](https://forum.aztec.network/t/implementing-contract-upgrades/2570)
- [Contract classes, upgrades, and default accounts](https://forum.aztec.network/t/contract-classes-upgrades-and-default-accounts/433)
  :::

## Structure

<!-- [Mike review, for @spalladino][cspell:disable-line]
We're missing some important details (that would enable me to unambiguously build this from this document alone):
- How exactly is this data hashed together into a `contract_class_id`? We're missing details of the 'topology' of how each struct (and each member of each struct) is hashed. It's briefly described in the '### class identifier' section below, but could be made more precise. E.g. these (slightly outdated) illustrations: https://forum.aztec.network/t/proposal-abstracting-contract-deployment/2576.
- Details of the hash to use, and a domain separator for the hash. We might not know the final hash that we'll use, but we should propose one, and we should probably also give each hash a name.
    - E.g. `contract_class_id = contract_class_id_hash("contract_class_id".to_field(), version.to_field(), registerer_address.to_field(), etc...)` where `contract_class_id_hash = pedersen_hash` (for now).
- We're missing details of how a function tree is computed. E.g. what is the preimage of a function leaf, and how deep is this tree?
- If private bytecode isn't broadcast to L1, what information (about the function tree leaves/nodes) do we still need to broadcast, to enable sibling paths to be derived for public functions?
 -->

The structure of a contract class is defined as:

<!-- prettier-ignore -->
| Field | Type | Description |
|----------|----------|----------|
| `version` | `u8` | Version identifier. Initially one, bumped for any changes to the contract class struct. |
| `registerer_address` | `AztecAddress` | Address of the canonical contract used for registering this class. <!-- TODO: explain why is this included? --> |
| `artifact_hash` | `Field` | Hash of the entire contract artifact, including compiler information, proving backend, and all generated ACIR and Brillig. The specification of this hash is left to the compiler and not enforced by the protocol. |
| `constructor_function` | [`PrivateFunction`](#private-function) | PublicFunction | Constructor for instances of this class. |
| `private_functions` | `PrivateFunction[]` | List of private functions. |
| `public_functions` | [`PublicFunction[]`](#public-function) | List of public functions. |
| `unconstrained_functions` | [`UnconstrainedFunction[]`](#unconstrained-function) | List of unconstrained functions. |

<!--
TODO(palla): Do we need the artifact hash, if we're including the artifact hash of each individual function?
A(mike): An artifact will include 'global' contract data which isn't contained within a function's artifact hash. E.g. state variable declarations; the number of functions in the contract; the compiler version used; etc.
Q from mike: do we need the artifact hash in each individual function, if we have a 'global' artifact hash within the contract class struct? Does it make validation of code (before executing that code, for safety) faster? Hmm I suppose a per-function artifact hash is important, e.g. to link a function's combined acir & brillig bytecode to a vkhash (since the vkhash actually only represents the acir code).

Q(mike): What should `constructor_function` be if there is no constructor? A bunch of `0` fields?
-->
<!-- NOTE(palla): I'm deliberately omitting the portal bytecode hash here. -->

### Private Function

<!-- prettier-ignore -->
| Field | Type | Description |
|----------|----------|----------|
| `function_selector` | `u32` | Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is left to the compiler and not enforced by the protocol. |
| `vk_hash` | `Field` | Hash of the verification key associated to this private function. |
| `salt` | `Field` | Optional value for salting the bytecode of a function. |
| `artifact_hash` | `Field` | Hash of the compiled function artifact, including all generated ACIR and Brillig. The specification of this hash is left to the compiler and not enforced by the protocol. |
| `optional_bytecode` | `Buffer` | Optional bytecode (both ACIR & Brillig) for the function. Private function bytecode can be kept private if desired and only broadcasted to participants of the contract. |

<!-- [Mike review, for @spalladino][cspell:disable-line]
I've renamed `bytecode_hash` to `artifact_hash`, as I've interpreted this to mean a hash of some (out of protocol) artifact data that the compiler has spat-out. Or have I misunderstood, and this is literally the hash of the bytecode, as defined by the protocol?
Does Noir already create a space-efficient encoding of bytecode? What encoding does Noir output if a function is a combination of a ACIR & Brillig (e.g. a private function which makes an oracle call)?
-->

### Public Function

<!-- prettier-ignore -->
| Field | Type | Description |
|----------|----------|----------|
| `function_selector` | `u32` | Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is left to the compiler and not enforced by the protocol. |
| `artifact_hash` | `Field` | Hash of the compiled function artifact, including all generated AVM and Brillig code. The specification of this hash is left to the compiler and not enforced by the protocol. |
| `bytecode` | `Buffer` | An encoding of the bytecode (both avm bytecode & brillig bytecode) for the function. Must hash into the contract class's `artifact_hash`. |

### Unconstrained Function

<!-- prettier-ignore -->
| Field | Type | Description |
|----------|----------|----------|
| `function_selector` | `u32` | Selector of the function. Calculated as the hash of the method name and parameters. The specification of this is left to the compiler and not enforced by the protocol. |
| `artifact_hash` | `Field` | Hash of the compiled function artifact, including all generated Brillig code. The specification of this hash is left to the compiler and not enforced by the protocol. |
| `brillig_bytecode` | `Buffer` | An encoding of the Brillig bytecode for the function. Must hash into the contract class's `artifact_hash`. |

<!-- TODO(palla): Expand on the bytecode commitment scheme and bytecode_hash, both here and for private fns. -->

### Class Identifier

A.k.a. `contract_class_id`, the class identifier is computed by merkleizing the lists of private, public, and unconstrained functions separately, replacing the functions lists in the contract class struct with their respective tree roots, and then hashing the resulting struct.

<!-- [Mike review, for @spalladino][cspell:disable-line] As touched on in the bigger comment above, please could we make the details of this computation more precise, to avoid ambiguities? -->

## Registration

A contract class is registered by calling a private `register` function in a canonical `ContractClassRegisterer` contract. The `register` function receives a `ContractClass` struct as defined above, except for the `registerer_address`, and performs the following checks:

- `version` is 1 for the initial release
- `bytecode` for each function hashes to the `bytecode_hash`

The `register` function then:

- Emits the `ContractClass` struct via a `NewContractClassRegistration` unencrypted event. <!-- Q: how are events named in Solidity? `NewContractClassRegistered` (stating what has happened)? `Register` (to match the function name)? `RegisterNewContractClass` (an imperative)? Are we "registering" or "declaring" or "defining"? -->
<!-- TODO: Does the entire `ContractClass` struct actually need to be emitted, or can we emit less data? Can some data instead be gleaned from the smart contract's source code (using the same conventions as disseminating contract data for ethereum)? I remember considering this in my outdated diagrams from early 2023, but haven't considered it for our latest architecture. -->
- Computes the `contract_class_id` as the hash of the `ContractClass` object. <!-- TODO: describe the exact hashing computation. -->
- Emits the computed `contract_class_id` as a nullifier.
  - Note: The [private kernel circuit](../circuits/private-kernel-initial.md) will 'silo' <!-- TODO: link to relevant section --> this so-called "inner nullifier" (the `contract_class_id` itself) with the contract address of the `ContractClassRegisterer` contract to produce a so-called "outer nullifier" (the `contract_class_id_nullifier`). So nodes will need to reconstruct the `contract_class_id` from the `NewContractClassRegistration` event, and then attempt to reconstruct the "outer nullifier", to validate both the `contract_class_id` and that the canonical `ContractClassRegisterer` was indeed the source of the event.

<!-- Q: should we write some pseudocode, or do you think these bullet points suffice? -->

Upon seeing a `NewContractClassRegistration` event in a mined transaction, nodes are expected to store the contract class, so they can retrieve it when executing a public function for that class.

Note that emitting the `contract_class_id` as a nullifier (the `contract_class_id_nullifier`), instead of as an entry in the note hashes tree, allows public functions to prove non-existence of a class, which is required to support public contract instance deployments.

<!-- [Mike review, for @spalladino][cspell:disable-line]
TODO: Perhaps we should write the details of this Registration contract in a similar way to ERC interface specifications? E.g. specify all state variables, functions, event names of the Registration contract. (Or are there no other functions, other than `register`?).
-->

## Who registers the `ContractClassRegisterer`?

The `ContractClassRegisterer` will need to exist from the genesis of the Aztec Network, otherwise nothing will ever be deployable to the network! The `class_id` for the `ContractClassRegisterer` will be pre-inserted into the genesis nullifier tree at leaf index `GENESIS_NULLIFIER_LEAF_INDEX_OF_CLASS_REGISTERER_CLASS_ID_NULLIFIER = 1`.

> Note: leaf index `0` of the nullifier tree is reserved for the leaf `{ 0, 0, 0 }`. See [here](../state/nullifier_tree.md).

<!-- Note: that name is a mouthful, but I figure there will be many genesis constants, so ordering the string from left-to-right with the 'most general' info to 'most specific' info feels right. -->

<!-- TODO: perhaps we need a page of constants? -->

<!-- TODO(cryptography): How do we convince the world that there's 'nothing up our sleeves'? What could be the consequences of a cunningly-chosen nullifier being pre-inserted into the nullifier tree? -->

The initial canonical instance of the `ContractClassRegisterer` contract will have address `???` <!-- TODO -->. The corresponding contract address nullifier <!-- TODO: link to the relevant instances section --> will be `GENESIS_NULLIFIER_LEAF_INDEX_OF_CLASS_REGISTERER_CONTRACT_ADDRESS_NULLIFIER = 2`.
