---
title: Testing Cheat Codes
---

## Introduction

Most of the time, simply testing your smart contract isn't enough. To manipulate the state of the Aztec blockchain, as well as test for specific reverts and events, the sandbox is shipped with a set of cheatcodes.

Cheatcodes allow you to change the time of the L2 block, load certain state or more easily manipulate L1 instead of having to write dedicated RPC calls to anvil. 

:::info Prerequisites
If you aren't familiar with [Anvil](https://book.getfoundry.sh/anvil/), we recommend reading up on that since Aztec Sandbox uses Anvil as the local L1 instance.
:::

### Aims

The guide will cover how to manipulate the state of the:
- L1 blockchain
- Aztec network.
### Why is this useful?

<!-- Contextualise why a dapp developer needs this. What use cases / products / features does this unlock? Any real world examples? -->

### Dependencies

For this guide, the following Aztec packages are used:
- @aztec/aztec.js

### Initialisation
```js
import { createAztecRpcClient, CheatCodes } from '@aztec/aztec.js';
const aztecRpcUrl = 'http://localhost:8080';
const aztecRpcClient = createAztecRpcClient(aztecRpcUrl);
const cc = CheatCodes.create(aztecRpcUrl, aztecRpcClient);
```

There are two properties of the CheatCodes class - `l1` and `l2` for cheatcodes relating to the L1 and L2 (Aztec) respectively.

## L1 related cheatcodes
These are cheatcodes exposed from anvil. But instead of having to know the right RPC calls to make and format the curl request appropirately, there are convenient wrappers exposed to developers.

### Interface
```
// Fetch current block number of L1
public async blockNumber(): Promise<number> 

// Fetch chain ID of L1
public async chainId(): Promise<number> 

// Fetch current timestamp on L1
public async timestamp(): Promise<number> 

// Mine a given number of blocks on L1. Mines 1 block by default
public async mine(numberOfBlocks = 1): Promise<void> 

// Set the timestamp for the next block on L1. 
public async setNextBlockTimestamp(timestamp: number): Promise<void> 

// Dumps the current L1 chain state to a given file. Can be used with `loadChainState()` to first create a forked version of mainnet on anvil (to for example interact with uniswap), save the chain state to a file, and later load it to the sandbox' anvil instance.
public async dumpChainState(fileName: string): Promise<void> 

// Loads the L1 chain state from a file. You may use `dumpChainState()` to save the state of the L1 chain to a file and later load it. 
public async loadChainState(fileName: string): Promise<void> 

// Load the value at a storage slot of a contract address on L1
public async load(contract: EthAddress, slot: bigint): Promise<bigint> 

// Set the value at a storage slot of a contract address on L1 (e.g. modify a storage variable on your portal contract or even the rollup contract). 
public async store(contract: EthAddress, slot: bigint, value: bigint): Promise<void> 

// Computes the slot value for a given map and key on L1. A convenient wrapper to find the appropriate storage slot to load or overwrite the state.
public keccak256(baseSlot: bigint, key: bigint): bigint

// Send transactions on L1 impersonating an externally owned account or contract.
public async startPrank(who: EthAddress): Promise<void> 

// Stop impersonating an account on L1 that you are currently impersonating.
public async stopPrank(who: EthAddress): Promise<void> 

// Set the bytecode for a L1 contract
public async etch(contract: EthAddress, bytecode: `0x${string}`): Promise<void> 

// Get the bytecode for a L1 contract
public async getBytecode(contract: EthAddress): Promise<`0x${string}`> 
```

### blockNumber

#### Function Signature 
```js
public async blockNumber(): Promise<number>
```

#### Description
Fetches the current L1 block number

#### Example
```js
const blockNumber = await cc.l1.blockNumber()
```

### chainId

#### Function Signature 
```js
public async chainId(): Promise<number>  
```

#### Description
Fetches the L1 chain ID

#### Example 
```js
const chainId = await cc.l1.chainId()
```

### timestamp

#### Function Signature
```js
public async timestamp(): Promise<number> 
```

#### Description 
Fetches the current L1 timestamp

#### Example
```js 
const timestamp = await cc.l1.timestamp()
```

### mine

#### Function Signature
```js
public async mine(numberOfBlocks = 1): Promise<void> 
```

#### Description
Mines the specified number of blocks on L1 (default 1)

#### Example
```js
const blockNum = await cc.l1.blockNumber();
await cc.l1.mine(10) // mines 10 blocks
const newBlockNum = await cc.l1.blockNumber(); // = blockNum + 10.
```

### setNextBlockTimestamp

#### Function Signature  
```js
public async setNextBlockTimestamp(timestamp: number): Promise<void>
```

#### Description
Sets the timestamp (unix format in seconds) for the next mined block on L1  
Remember that timestamp can only be set in the future and not in the past.

#### Example
```js
await cc.l1.setNextBlockTimestamp(1692183270) // Set next block timestamp to 16 Aug 2023 10:54:30 GMT
// next transaction you will do will have the timestamp as 1692183270
```

### dumpChainState

#### Function Signature
```js
public async dumpChainState(fileName: string): Promise<void> 
```

#### Description
Dumps the current L1 chain state to a file
Returns a hex string representing the complete state of the chain. Can be re-imported into a fresh/restarted instance of Anvil to reattain the same state.

#### Example
```js
await cc.l1.dumpChainState('chain-state.json') 
```

### loadChainState

#### Function Signature 
```js
public async loadChainState(fileName: string): Promise<void>
```

#### Description
Loads the L1 chain state from a file. 
When given a hex string previously returned by `cc.l1.dumpChainState()`, merges the contents into the current chain state. Will overwrite any colliding accounts/storage slots.

#### Example  
```js
await cc.l1.loadChainState('chain-state.json')
```

### load  

#### Function Signature
```js
public async load(contract: EthAddress, slot: bigint): Promise<bigint>
```

#### Description  
Loads the value at a storage slot of a L1 contract

#### Example
```
/// contract LeetContract {
///     uint256 private leet = 1337; // slot 0
/// }

const value = await cc.l1.load(EthAddress.from(leetContractAddress), BigInt(0));
console.log(value); // 1337
```

### store

#### Function Signature
```js
public async store(contract: EthAddress, slot: bigint, value: bigint): Promise<void>  
```

#### Description
Stores the value in storage slot on a L1 contract

#### Example
```
/// contract LeetContract {
///     uint256 private leet = 1337; // slot 0
/// }

await cc.l1.store(EthAddress.from(leetContractAddress), BigInt(0), BigInt(1000));
const value = await cc.l1.load(EthAddress.from(leetContractAddress), BigInt(0));
console.log(value); // 1000
```

### keccak256

#### Function Signature  
```js
public keccak256(baseSlot: bigint, key: bigint): bigint
```

#### Description 
Computes the storage slot for a map key

#### Example
```
/// contract LeetContract {
///     uint256 private leet = 1337; // slot 0
///     mapping(address => uint256) public balances; // base slot 1
/// }

// find the storage slot for key `0xdead` in the balance map.
const address = BigInt('0x000000000000000000000000000000000000dead');
const slot = cc.l1.keccak256(BigInt(1), key) 
// store balance of 0xdead as 100
await cc.l1.store(contractAddress, slot, 100n);
```

### startPrank

#### Function Signature
```js 
public async startPrank(who: EthAddress): Promise<void>
```

#### Description  
Start impersonating an L1 account
Sets msg.sender for all subsequent calls until stopPrank is called.

#### Example
```js
await cc.l1.startPrank(EthAddress.fromString(address));
```

### stopPrank

#### Function Signature
```js
public async stopPrank(who: EthAddress): Promise<void>
```

#### Description
Stop impersonating an L1 account  
Stops an active prank started by startPrank, resetting msg.sender to the values before startPrank was called.

#### Example
```js  
await cc.l1.stopPrank(EthAddress.fromString(address)) 
```

### getBytecode

#### Function Signature
```js
public async getBytecode(contract: EthAddress): Promise<`0x${string}`>
```

#### Description  
Get the bytecode for an L1 contract

#### Example
```js
const bytecode = await cc.l1.getBytecode(contract) // 0x6080604052348015610010...
```

### etch

#### Function Signature 
```js
public async etch(contract: EthAddress, bytecode: `0x${string}`): Promise<void> 
```

#### Description
Set the bytecode for an L1 contract

#### Example  
```js
const bytecode = `0x6080604052348015610010...`
await cc.l1.etch(contract, bytecode)
console.log(await cc.l1.getBytecode(contract)) // 0x6080604052348015610010...
```

## L2 related cheatcodes
These are cheatcodes specific to manipulating the state of Aztec rollup.

### Interface
```
// Get the current L2 block number
public async blockNumber(): Promise<number>

// Set time of the next execution on L2. It also modifies time on L1 for next execution and stores this time as the last rollup block on the rollup contract.
public async warp(to: number): Promise<void>

// Loads the value stored at the given slot in the public storage of the given contract.
public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr>

// Computes the slot value for a given map and key.
public computeSlotInMap(baseSlot: Fr | bigint, key: Fr | bigint): Fr
```

### blockNumber

#### Function Signature
```js
public async blockNumber(): Promise<number>
```

#### Description  
Get the current L2 block number

#### Example
```js
const blockNumber = await cc.l2.blockNumber()
```

### warp 

#### Function Signature
```js
public async warp(to: number): Promise<void>
```

#### Description
Set time of the next execution on L2 and L1 for next execution.
Like with the corresponding L1 cheatcode, time can only be set in the future, not the past.

#### Example
```js
const timestamp = await cc.l1.timestamp();
const newTimestamp = timestamp + 100_000_000;
await cc.l2.warp(newTimestamp);

// any noir contract calls that make use of current timestamp now will have `newTimestamp`
```

### loadPublic

#### Function Signature
```js
public async loadPublic(who: AztecAddress, slot: Fr | bigint): Promise<Fr> 
```

#### Description
Loads the value stored at the given slot in the public storage of the given contract.

#### Example
```
/// struct Storage {
///     current_value: PublicState<Field, FIELD_SERIALISED_LEN>,
/// }
/// 
/// impl Storage {
///     fn init() -> Self {
///         Storage {
///             current_value: PublicState::new(1, FieldSerialisationMethods),
///         }
///     }
/// }
/// 
/// contract Hello {
///     ...
/// }

const value = await cc.l2.loadPublic(contract, 1n) // current_value is stored in slot 1
```

### computeSlotInMap

#### Function Signature
```js
public computeSlotInMap(baseSlot: Fr | bigint, key: Fr | bigint): Fr
```

#### Description
Compute storage slot for a map key.
The baseSlot is specified in the noir contract. 

#### Example  
```
/// struct Storage {
///     balances: Map<EasyPrivateUint>,
/// }
/// 
/// impl Storage {
///     fn init() -> Self {
///         Storage {
///             balances: Map::new(1, |slot| EasyPrivateUint::new(slot)),
///         }
///     }
/// }
/// 
/// contract Token {
///     ...
/// }

const slot = cc.l2.computeSlotInMap(1n, key)
```
## Participate

Keep up with the latest discussion and join the conversation in the [Aztec forum](https://discourse.aztec.network).

You can also use the above link to request for more cheatcodes.

import Disclaimer from "../misc/common/\_disclaimer.mdx";
<Disclaimer/>