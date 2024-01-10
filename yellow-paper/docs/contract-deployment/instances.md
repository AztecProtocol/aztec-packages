# Contract instances

A contract instance is a concrete deployment of a [contract class](./classes.md). A contract instance always references a contract class, which dictates what code it executes when called. A contract instance has state (both private and public), as well as an address that acts as its identifier. A contract instance can be called into.

## Requirements

- Users must be able to precompute the address of a given contract instance. This allows users to precompute their account contract addresses and receive funds before interacting with the chain, and also allows counterfactual deployments.
- An address must be linked to its deployer address. This allows simple diversified and stealth account contracts. Related, a precomputed deployment may or may not be restricted to be executed by a given address.
- A user calling into an address must be able to prove that it has not been deployed. This allows the executor to prove that a given call in a transaction is unsatisfiable and revert accordingly.
- A user should be able to privately call into a contract without publicly deploying it. This allows private applications to deploy contracts without leaking information about their usage.

## `ContractInstance` structure

The structure of a contract instance is defined as:

<!-- prettier-ignore -->
| Field | Type | Description |
|----------|----------|----------|
| `version` | `u8` | Version identifier. Initially one, bumped for any changes to the contract instance struct. |
| `deployer_address` | `AztecAddress` | Address of the canonical deployer contract that creates this instance. <!-- TODO: explain why this is included. --> |
| `salt` | `Field` | User-generated pseudorandom value for uniqueness. |
| `contract_class_id` | `Field` | Identifier of the contract class for this instance. |
| `contract_args_hash` | `Field` | Hash of the arguments to the constructor. |
| `portal_contract_address` | `EthereumAddress` | Optional address of the L1 portal contract. |
| `public_keys_hash` | `Field` | Optional hash of the struct of public keys used for encryption and nullifying by this contract. |

<!-- Note: Always ensure the spec above matches the one described in Addresses and Keys. -->

<!-- [Mike review, for @spalladino][cspell:disable-line]
We don't quite have constructor abstraction, given that a "constructor" is still a concept which the protocol must understand and distinguish -- see how we have a `contract_args_hash` in this `contract_instance` struct and a `constructor_function` field in the `contract_class` struct. Can these fields be removed? We certainly need a way to convey to future users of every contract what the constructor args were. Can this be achieved through notes, nullifiers, and events, or should we retain these constructor fields?

What should `contract_args_hash` be if there is no constructor? `0`?
Q: why "contract_args_hash" and not "constructor_args_hash"?
-->

## Address

The address of the contract instance is computed as the hash of all elements in the structure above, as defined in [the addresses and keys section](../addresses-and-keys/specification.md#address). This computation is deterministic, which allows any user to precompute the expected deployment address of their contract, including account contracts.

## Statuses

A contract instance at a given address can be in any of the following statuses:

- **Undeployed**: The instance has not yet been deployed. A user who knows the preimage of the address can issue a private call into the contract, as long as it does not require initialization. Public function calls to this address will fail, because existence of the 'contract address nullifier' <!-- n/d --> will be enforced for public calls, so that we can be certain that a sequencer has access to the public function's bytecode.
- **Privately deployed**: The instance's constructor has been executed <!-- TODO elaborate on what this means. Maybe link to a section which explains this? Does this also mean that the contract instance's address has been emitted as a nullifier? --> , but its [class identifier](./classes.md#class-identifier) has not been [registered](./classes.md#registration) nor broadcasted. A user who knows the preimage of the address can issue a private call into the contract, and successfully submit a private kernel proof of execution of this call to the network. Public function calls to this address will fail. Private deployments are signalled by emitting an initialization nullifier <!-- n/d --> when the constructor runs. <!-- TODO: is this the contract instance initialisation nullifier? I.e. the nullifier of the contract address? -->
- **Publicly deployed**: The instance constructor has been executed, and the address preimage has been broadcasted. All function calls to the address, private or public, are valid. Public deployments are signalled by emitting a public deployment nullifier.

<!-- TODO: Validate the need for private deployments. They seem cool, and do not incur in extra protocol complexity, but they require having two nullifiers per contract: one to signal initialization, and one to signal broadcasting of the deployment. -->

## Constructors

Contract constructors are not enshrined in the protocol, but handled at the application circuit level. A contract must satisfy the following requirements:

- The constructor must be invoked exactly once
- The constructor must be invoked with the arguments in the address preimage
- Functions that depend on contract initialization cannot be invoked until the constructor is run

These checks can be embedded in the application circuit itself. The constructor emits a standardized initialization nullifier <!-- TODO: should we propose a standard in this doc? We should certainly establish a name for this nullifier --> when it is invoked, which prevents it from being called more than once. The constructor code must also check that the arguments hash it received matches the ones in the address preimage, supplied via an oracle call. <!-- Can the `ContractInstanceDeployer` contract perform this check instead? It has access to both the `constructor_args_hash` and the args that it passes to the constructor (since it makes the call _to_ the constructor function). It might make the protocol simpler. --> All other functions in the contract must include a merkle membership proof for the nullifier, to prevent them from being called before the constructor is invoked. Note that a contract may choose to allow some functions to be called before initialization.

<!-- More generally we should adopt a convention to name all concepts, and consistently use those names throughout. We might wish to also consistently delineate named concepts with Capital Letters (like legal docs) or `inside_back_ticks` -->

The checks listed above should not be manually implemented by a contract developer, but rather included as part of the Aztec macros for Noir.

Constructors may be either private or public functions. Contracts with private constructors can be privately or publicly deployed, contracts with public constructors can only be publicly deployed.

<!-- FIXME: the contract class definition says the `constructor_function` is always of type `PrivateFunction`. -->

Removing constructors from the protocol itself simplifies the kernel circuit. Separating initialization from public deployment also enables developers to implement private deployments, since a private deployment is equivalent to just invoking the constructor function at a given address.

## Public Deployment

A new contract instance can be _publicly deployed_ by calling a `deploy` function in a canonical `ContractInstanceDeployer` contract. This function receives the arguments for a `ContractInstance` struct as described [above](#contractinstance-structure), except for the `deployer_address` which is the deployer's own address, and executes the following actions:

- Validates the referenced `contract_class_id` exists.
- Mixes in the `msg_sender` with the user-provided `salt` by hashing them together, ensuring that the deployment is unique for the requester.
- Computes the resulting `new_contract_address`.
- Emits the resulting address as a `contract_address_nullifier` (a.k.a. `contract_initialization_nullifier`) to signal the public deployment, so callers can prove that the contract has or has not been publicly deployed.
  - Note: The [private kernel circuit](../circuits/private-kernel-initial.md) will 'silo' <!-- TODO: link to relevant section --> the so-called "inner nullifier" (the `new_contract_address` itself) with the contract address of the `ContractInstanceDeployer` contract to produce a so-called "outer nullifier" (the `contract_address_nullifier`). So nodes will need to reconstruct the `new_contract_address` from the `NewContractInstanceDeployment` event, and then attempt to reconstruct the "outer nullifier", to validate both the `new_contract_address` and that the canonical `ContractInstanceDeployer` was indeed the source of the event.
- Either proves the corresponding `contract_class_id` has no constructor, or calls the constructor with the preimage of the supplied `contract_args_hash`, or proves that the constructor nullifier <!-- Is this the same as the aforementioned "initialization nullifier"? We should align naming. --> has already been emitted so a previously privately-deployed contract can be publicly deployed.
- Emits an unencrypted event `NewContractInstanceDeployment`, with the address preimage, excluding the `deployer_address` which is already part of the log.

<!-- Q: should we write some pseudocode, or do you think these bullet points suffice? -->

Upon seeing a `NewContractInstanceDeployment` event from the canonical `ContractInstanceDeployer` contract, nodes are expected to store the address and preimage, to verify executed code during public code execution as described in the next section.

The `ContractInstanceDeployer` contract provides two implementations of the `deploy` function: a private and a public one. Contracts with a private constructor are expected to use the former, and contracts with public constructors expected to use the latter. Contracts with no constructors or that have already been privately-deployed can use either.

Additionally, the `ContractInstanceDeployer` contract provides two `universal_deploy` functions, a private and a public one, with the same arguments as the `deploy` one, that just forwards the call to the `deploy` contract. This makes `msg_sender` in the `deploy` contract to be the `ContractInstanceDeployer` contract itself, and allows for universal deployments that are semantically decoupled from their deployer, and can be permissionlessly invoked by any user who knows the address preimage.

## Who deploys the `ContractInstanceDeployer`?

The `ContractInstanceDeployer` will need to exist from the genesis of the Aztec Network, otherwise nothing will ever be deployable to the network! The `contract_address_nullifier` for the `ContractInstanceDeployer` contract itself will be pre-inserted into the genesis nullifier tree at leaf index `GENESIS_NULLIFIER_LEAF_INDEX_OF_CONTRACT_INSTANCE_DEPLOYER_CLASS_ID_NULLIFIER = 3`.

<!-- Note: that name is a mouthful, but I figure there will be many genesis constants, so ordering the string from left-to-right with the 'most general' info to 'most specific' info feels right. -->

<!-- TODO: perhaps we need a page of constants? -->

<!-- TODO(cryptography): How do we convince the world that there's 'nothing up our sleeves'? What could be the consequences of a cunningly-chosen nullifier being pre-inserted into the nullifier tree? -->

The initial canonical instance of the `ContractInstanceDeployer` contract will have address `???` <!-- TODO -->. The corresponding contract address nullifier <!-- TODO: link to the relevant instances section --> will be `GENESIS_NULLIFIER_LEAF_INDEX_OF_CONTRACT_INSTANCE_DEPLOYER_CONTRACT_ADDRESS_NULLIFIER = 4`.

## Verification of Executed Code

The kernel circuit, both private and public, is responsible for verifying that the code loaded for a given function execution matches the expected one. This requires the following checks:

- The `contract_class_id` of the address called is the expected one, verified by hashing the address preimage that includes the `contract_class_id`.
- The function identifier <!-- n/d --> being executed is part of the `contract_class_id`, verified via a Merkle membership proof.
- The function code <!-- n/d --> executed matches the commitment <!-- n/d --> in the function identifier, verified via a merkle membership proof and a bytecode commitment proof <!-- n/d -->.

<!-- Note: I only just thought to use `n/d` to mean "not defined". Please forgive the liberal usage of it. -->

Note that, since constructors are handled at the application level, the kernel circuit is not required to check that a constructor has been run before executing code.

The public kernel circuit, additionally, needs to check that the corresponding contract instance has been publicly deployed, or prove that it hasn't. This is done via a merkle (non-)membership proof of the public deployment nullifier <!-- n/d -->.

## Discarded Approaches

Earlier versions of the protocol relied on a dedicated contract tree, which required dedicated kernel code to process deployments, which had to be enshrined as new outputs from the application circuits. By abstracting contract deployment and storing deployments as nullifiers, the interface between the application and kernel circuits is simplified, and the kernel circuit has fewer responsibilities. Furthermore, multiple contract deployments within a single transaction are now possible.
