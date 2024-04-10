---
## title: Call Types
---

# Understanding Call Types

## What is a Call

We say that a smart contract is called when one of its functions is invoked and its code is run. This means there'll be:

- a caller
- arguments
- return values
- a call status (successful or failed)

There are multiple types of calls, and some of the naming can make things **very** confusing. This page lists the different call types and execution modes, pointing out key differences between them.

# Ethereum Call Types

Even though we're discussing Aztec, its design is heavily influenced by Ethereum and many of the APIs and concepts are quite similar. It is therefore worthwhile to briefly review how things work there and what naming conventions are used to provide context to the Aztec-specific concepts.

Broadly speaking, Ethereum contracts can be thought of as executing as a result of three different things: running certain EVM opcodes, running Solidity code (which compiles to EVM opcodes), or via the node JSON-RPC interface (e.g. when executing transactions).

## EVM

Certain opcodes allow contracts to make calls to other contracts, each with different semantics. We're particularly interested in `CALL` and `STATICCALL`, and how those relate to contract programming languages and client APIs.

### `CALL`

This is the most common and basic type of call. It grants execution control to the caller until it eventually returns. No special semantics are in play here. Most Ethereum transactions spend the majority of their time in `CALL` contexts.

### `STATICCALL`

This behaves almost exactly the same as `CALL`, with one key difference: any state-changing operations are forbidden and will immediately cause the call to fail. This includes writing to storage, emitting logs, or deploying new contracts. This call is used to query state on an external contract, e.g. to get data from a price oracle, check for access control permissions, etc.

### Others

The `CREATE` and `CREATE2` opcodes (for contract deployment) also result in something similar to a `CALL` context, but all that's special about them has to do with how deployments work. `DELEGATECALL` (and `CALLCODE`) are somewhat complicated to understand but don't have any Aztec equivalents, so they are not worth covering.

## Solidity

Solidity (and other contract programming languages such as Vyper) compile down to EVM opcodes, but it is useful to understand how they map language concepts to the different call types.

### Mutating External Functions

These are functions marked `payable` (which can receive ETH, which is a state change) or with no mutability declaration (sometimes called `nonpayable`). When one of these functions is called on a contract, the `CALL` opcode is emitted, meaning the callee can perform state changes, make further `CALL`s, etc.

It is also possible to call such a function with `STATICCALL` manually (e.g. using assembly), but the execution will fail as soon as a state-changing opcode is executed.

### `view`

An external function marked `view` will not be able to mutate state (write to storage, etc.), it can only _view_ the state. Solidity will emit the `STATICCALL` opcode when calling these functions, since its restrictions provide added safety to the caller (e.g. no risk of reentrancy).

Note that it is entirely possible to use `CALL` to call a `view` function, and the result will be the exact same as if `STATICCALL` had been used. The reason why `STATICCALL` exists is so that _untrusted or unknown_ contracts can be called while still being able to reason about correctness. From the [EIP](https://eips.ethereum.org/EIPS/eip-214):

> '`STATICCALL` adds a way to call other contracts and restrict what they can do in the simplest way. It can be safely assumed that the state of all accounts is the same before and after a static call.'

## JSON-RPC

From outside the EVM, calls to contracts are made via [JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/) methods, typically from some client library that is aware of contract ABIs, such as [ethers.js](https://docs.ethers.org/v5) or [viem](https://viem.sh/).

## `eth_sendTransaction`

This method is how transactions are sent to a node to get them to be broadcast and eventually included in a block. The specified `to` address will be called in a `CALL` context, with some notable properties:

- there are no return values, even if the contract function invoked does return some data
- there is no explicit caller: it is instead derived from a provided signature

Some client libraries choose to automatically issue `eth_sendTransaction` when calling functions from a contract ABI that are not marked as `view` - [ethers is a good example](https://docs.ethers.org/v5/getting-started/#getting-started--writing). Notably, this means that any return value is lost and not available to the calling client - the library typically returns a transaction receipt instead. If the return value is required, then the only option is to simulate the call `eth_call`.

Note that it is possible to call non state-changing functions (i.e. `view`) with `eth_sendTransaction` - this is always meaningless. What transactions do is change the blockchain state, so all calling such a function achieves is for the caller to lose funds by paying for gas fees. The sole purpose of a `view` function is to return data, and `eth_sendTransaction` does not make the return value available.

## `eth_call`

This method is the largest culprit of confusion around calls, but unfortunately requires understanding of all previous concepts in order to be explained. Its name is also quite unhelpful.

What `eth_call` does is simulate a transaction (a call to a contract) given the current blockchain state. The behavior will be the exact same as `eth_sendTransaction`, except:

- no actual transaction will be created
- while gas _will_ be measured, there'll be no transaction fees of any kind
- no signature is required: the `from` address is passed directly, and can be set to any value (even if the private key is unknown, or if they are contract addresses!)
- the return value of the called contract is available

`eth_call` is typically used for one of the following:

- query blockchain data, e.g. read token balances
- preview the state changes produced by a transaction, e.g. the transaction cost, token balance changes, etc

Because some libraries ([such as ethers](https://docs.ethers.org/v5/getting-started/#getting-started--reading)) automatically use `eth_call` for `view` functions (which when called via Solidity result in the `STATICCALL` opcode), these concepts can be hard to tell apart. The following bears repeating: **an `eth_call`'s call context is the same as `eth_sendTransaction`, and it is a `CALL` context, not `STATICCALL`.**

# Aztec

<!-- TODO: go over private and public execution, top-levle unconstrained, prove() vs simulate() etc -->
