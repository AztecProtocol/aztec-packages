---
title: Typescript test code
---

Now that you have the contracts written and compiled, let's deploy and interact with them.

In the root package, let's create a test util file:
```bash
cd packages/src/test
touch utils.ts
```

And add the following code to help extract L1 contract artifacts and deploying a L1 contract to anvil.

```ts
import { AztecAddress, EthAddress, Fr, TxStatus, Wallet } from '@aztec/aztec.js';
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';

import type { Abi, Narrow } from 'abitype';
import * as fs from 'fs';
import { Account, Chain, Hex, HttpTransport, PublicClient, WalletClient, getContract } from 'viem';

const PATH = "../../packages/l1-contracts/artifacts/contracts";
const EXT = ".sol"

function getL1ContractABIAndBytecode(contractName: string) {
    const pathToArtifact = `${PATH}/${contractName}${EXT}/${contractName}.json`;
    const artifacts = JSON.parse(fs.readFileSync(pathToArtifact, 'utf-8'));
    return [artifacts.abi, artifacts.bytecode];
}
const [PortalERC20Abi, PortalERC20Bytecode] = getL1ContractABIAndBytecode("PortalERC20");
const [TokenPortalAbi, TokenPortalBytecode] = getL1ContractABIAndBytecode("TokenPortal");
export const [UniswapPortalAbi, UniswapPortalBytecode] = getL1ContractABIAndBytecode("UniswapPortal");

#include_code util_crosschain /yarn-project/canary/src/utils.ts raw
```

Now go back to the index.ts and let's begin writing the test based on the flow we spoke about

We want to swap WETH on L2 for DAI on L1 Uniswap and bridge it back to L2. 

At a technical level, we will: 
0. Get the sandbox to run against a forked version of mainnet so we can make use of Uniswap.
1. Create a token portal for WETH and one for DAI and deploy their subsequent token bridges and token contracts on L2.
2. Mint some WETH on L1 (to eventually bridge to L2)
3. Approve the WETH to be transferred to its token portal and then deposit it privately
4. Claim WETH on L2
Now we can do our swap -
5. Approve the uniswap contract to move WETH to itself
6. Swap on L1!! We call our uniswap L2 contract to swap privately
7. Execute the Swap on L1 by calling the Uniswap Portal and deposit swapped DAI to Dai Portal
8. Claim and Redeem DAI on L2

TODO - change uniswap canary to beforeAll, afterAll!
TODO - add public flow to uniswap canary!

We must also do this for the public flow that the second test does.

```ts
import { expect, beforeAll, afterAll} from '@jest/globals';

#include_code uniswap_bridge /yarn-project/canary/src/uniswap_trade_on_l1_from_l2.test.ts raw
```

Replace 
```ts
import { UniswapPortalAbi, UniswapPortalBytecode } from '@aztec/l1-artifacts';
```
with

```ts
import { UniswapPortalAbi, UniswapPortalBytecode } from './utils.js';
```