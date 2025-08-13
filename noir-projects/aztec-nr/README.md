<div align="center">
  <img height="210" src="./assets/Aztec_banner.png" />

  <h1>Aztec.nr</h1>

  <p>
    <strong>Aztec Smart Contract Framework</strong>
  </p>

  <p>
    <a href="https://github.com/AztecProtocol/aztec-nr/actions"><img alt="Build Status" src="https://github.com/AztecProtocol/aztec-nr/actions/workflows/tests.yaml/badge.svg" /></a>
    <a href="https://docs.aztec.network"><img alt="Aztec Website" src="https://img.shields.io/badge/docs-tutorials-blueviolet" /></a>
    <a href="https://discord.gg/p6BBdH9ctY"><img alt="Discord Chat" src="https://img.shields.io/discord/889577356681945098?color=blueviolet" /></a>
    <a href="https://opensource.org/licenses/Apache-2.0"><img alt="License" src="https://img.shields.io/github/license/AztecProtocol/aztec-nr?color=blueviolet" /></a>
  </p>
</div>

# Aztec.nr

`Aztec-nr` is a [Noir](https://noir-lang.org) framework for writing smart contracts on [Aztec](aztec.network).

## Noir vs Aztec.nr

For those already used to ("Vanilla") Noir:

| | Vanilla Noir | Aztec.nr |
|---|---|---|
| High-level distinction | A language for writing a provable program. | A library of helpful functions, state variables, and annotations, written in the Noir language. These can be imported and used like lego bricks, to create an Aztec smart contract. |
| Can write Aztec smart contracts?  | No | Yes |
| What language do I write my smart contract in? | n/a | You write your contract logic in Noir. It's just you'll be heavily using the imported annotations, structs and functions from this aztec-nr framework. So all of the logic relating to: declaring state variables; declaring functions; managing state; emitting events, will look clean and readable. The bodies of your functions will still be vanilla Noir. |
| # programs (provable functions) | 1 program per Noir package | An entire collection of programs (smart contract functions), collected into a "contract" scope, that can operate on Aztec state. |
| Can manage state variables?  | Not without basically re-writing all of Aztec.nr. | Yes - abstracts-away state management. (You don't need to design and implement your own state trees, for example -- you just plug into Aztec's state trees). |
| How is a proof verified? | Pass the proof to a NoirJS verifier, or a Solidity verifier. | Send the proof to the Aztec network. |
| Code compiles to... | ACIR | ACIR (for private functions), Brillig (for utility functions), AVM bytecode (for public functions) |
| Public Inputs | Can be anything. | Behind-the-scenes, the public inputs rigidly adhere to the Aztec protocol spec. |

A smart contract is essentially some persistent state variables, and a collection of functions which may edit those state variables. But it needs to be able to read and write data to the Aztec network, and the behind-the-scenes nature of how that works is very complex.

Aztec.nr is a gigantic Noir library, which seeks to hide-away all of the complexities of interacting with Aztec. You get to import nice, intuitive types and functions, whilst behind the scenes Aztec.nr does a huge amount of complex stuff to convert your intentions into Aztec-compatible instructions.


## Writing an Aztec smart contract with `aztec-nr`

See [here](https://docs.aztec.network/developers/guides/smart_contracts) for more details.

- Create a Noir project
- Import `aztec-nr` as a dependency
- Use the various annotations, state variables, and libraries of `aztec-nr` to write your smart contract.
- See some example contracts [here](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-contracts/contracts).


## Directory Structure

This noir workspace contains multiple packages. You can import these packages into your Noir project.

```
.
└── aztec               // The main framework for writing Aztec smart contracts

// Helpful types that are commonly used alongside the `aztec` library:
├── uint-note           // An off-the-shelf Note struct, for storing a private u128
├── value-note          // An off-the-shelf Note struct, for storing a private Field
└── address-note        // An off-the-shelf Note struct, for storing a private AztecAddress
```

> To be deprecated from the top-level workspace libraries:
> `CompressedString`
> `EasyPrivateUint`

> To be relocated from the top-level workspace libraries:
> `macro_compilation_failure_tests`


## Importing `aztec-nr`

To import `aztec-nr` into your own Aztec smart contract project, you'll need to add `aztec-nr` as a dependency inside your project's `Nargo.toml`:

```toml
[package]
name = "your_contract"
authors = ["you! ;) "]
compiler_version = "<current_noir_version>"
type = "contract"

[dependencies]
# To install the aztec framework (required to create aztec contracts).
aztec = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "master" , directory = "aztec" }

# Optional libraries
easy_private_state = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "master" , directory = "easy-private-state" }
value_note = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "master" , directory = "value-note" }
```

## Installation

See the [Aztec Quickstart Guide](https://docs.aztec.network/developers/getting_started) to install all of the tools needed to write, test, deploy and execute Aztec smart contracts. This is a superset of the tooling needed to write a vanilla Noir program.

## Aztec State

Aztec has two kinds of state:

- Public state
- Private state

### Public State

Public state is similar to Ethereum smart contract state. Public state can be mutated by making calls to `#[public]` functions as part of a transaction.

> The public functions of a transaction are executed by the current Proposer.
> A Proposer is a node on the network with the temporary power to build blocks filled with transactions. This block-building power is randomly changed regularly between a set of Validators.
> The transactions in a block are processed one-after-the-other, and the _public_ functions of each transaction are executed in a specific order.

The fact that public functions are executed _live_, one-after-the-other, means each public function has access to the entire "current" public state of the Aztec blockchain at the time it is executed.

The general pattern for mutating _public_ state in a _public_ function is:
- read the current state
- mutate the state, however you wish
- write the updated state

`aztec-nr` exposes the following public state variables:

- `PublicMutable`
  - `write`
  - `read`
- `PublicImmutable`
  - `initialize`
  - `read`
- `DelayedPublicMutable`
  - In a public function:
    - `schedule_value_change`
    - `schedule_delay_change`
    - `get_current_value` / `get_scheduled_value`
    - `get_current_delay` / `get_scheduled_delay`
  - In a private function:
    - `get_current_value`

See the relevant files for explanations of their properties, and when to use which.

### Private State

Private state is fundamentally different from Ethereum smart contract state.

Private state can only be modified by a user who is _privy_ to that private state, to ensure that the user's secrets stay safe on their device. Any changes to private state are executed within `#[private]` functions.

> Advanced: Each private function execution is proven to be correct with a zero-knowledge proof, which enables private data to be operated on without leaking that data. But generating a proof of a function execution takes slightly longer than conventional native execution of function.

With these things in mind, it would be impractical for all users around the world to form an orderly queue to make changes to their own private state variables one-after-the-other, because sequentially executing and proving each private function would take too long. Throughput would be terrible.

Instead, private functions are executed _asynchronously_, offchain. This enables each user to process any changes to _their own private state_, in their own time, on their own device. All users can do this in parallel.

This asynchronicity has resulted in an unusual state model for Aztec private state.

Whilst a user goes about executing some private functions offchain (on their own device), the _public_ state of the Aztec blockchain will continue to advance. This means as soon as a user commences private execution, their view of the chain will 'branch-off' from the current public view. A private function will not be able to read the "current" public state, because that state will have advanced, and it will not be able to immediately write to the "current" state of the chain, because the user is not the current Proposer.

This is ok, as long as each private function only mutates _the user's own_ private state. Since nobody else _knows_ the user's private state (because it is private), there will be no collisions with the state modifications of any other functions being processed by other users at the same time.

This state model is achieved with Notes and Nullifiers.

A Note can be any custom struct of information, most likely some _private_ information.

A Note can be stored onchain, and as such, a Note can represent a piece of private state.

A single Note might represent the entirety of some private state, like a private NFT.

Or a Note might be one of many notes that, when collected together, can be combined and interpreted to represent some private state. For example, a user's token balance might be made up of a collection of notes which, when collected together and summed, can be interpreted to represent the user's total token balance.

It's a weird model, but `aztec-nr` provides some neat abstractions that seek to make this model intuitive to users.

`aztec-nr` already offers some common off-the-shelf notes, e.g. to represent a private `u128` or a private `AztecAddress`. A user can also define their own note structs to store more-complex private information.

`aztec-nr` then has a notion of "private state variables", which serve as a wrapper to enable notes to be written-to and read-from Aztec's private state tree.

- `PrivateMutable`
  - `initialize`
  - `replace`
  - `initialize_or_replace`
  - `get_note`
- `PrivateImmutable`
  - `initialize`
  - `get_note`
- `PrivateSet`
  - `insert`
  - `remove`
  - `pop_notes`
  - `get_notes`

See the relevant files for explanations of their properties, and when to use which.

### Container state

`aztec-nr` has the following containers within which state can be stored, if required:

- `Map`





