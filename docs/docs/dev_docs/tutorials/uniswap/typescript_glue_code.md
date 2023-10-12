---
title: Deploy & Call Contracts with Typescript
---

So far we have written our solidity and aztec-nr functions to swap L2 tokens on L1 and get emit a message to deposit assets back on L2. But we haven't yet interacted with the sandbox to actually execute the code and see the tokens being bridged and swapped. We will now write a test to interact with the sandbox and see the expected results!

In the root folder, go to `packages/src` folder where we added `jest`:
```bash
cd packages/src
mkdir test && cd test
touch uniswap.test.ts
```

Open `uniswap.test.ts`:

We will write two tests:
1. Test the private flow (i.e. mint tokens on L1, deposit them to L2, give your intention to swap L2 asset on L1, swap on L1, bridge swapped assets back to L2)
2. Do the same in the public flow

## Test imports and setup
This is exactly the same as the setup for the tests in the token bridge tutorial. Copy the `utils.ts` and `cross_chain_test_harness.ts` we have defined that tutorial [here](../token_portal/typescript_glue_code.md#test-imports-and-setup).

In `utils.ts`, also add:
```typescript
const [UniswapPortalAbi, UniswapPortalBytecode] = getL1ContractABIAndBytecode("UniswapPortal");
```

### Setup the fork
Since we want to use L1 Uniswap, we need the sandbox to execute against a fork of L1. This has be easily done:
in your terminal add the following variables:
```
export FORK_BLOCK_NUMBER=17514288
export FORK_URL=<YOUR_RPC_URL e.g. https://mainnet.infura.io/v3/API_KEY>
```

### Back to test setup
Okay now we are ready to write our tests:

open `uniswap.test.ts` and lets do the initial description of the test:
```typescript
import { AccountWallet, AztecAddress, DebugLogger, EthAddress, Fr, PXE, TxStatus, computeAuthWitMessageHash, createDebugLogger, createPXEClient, getSandboxAccountsWallets, waitForSandbox } from "@aztec/aztec.js";
import { Chain, HttpTransport, PublicClient, createPublicClient, createWalletClient, getContract, http, parseEther } from "viem";
import { foundry } from "viem/chains";
import { CrossChainTestHarness } from "./fixtures/cross_chain_test_harness.js";
import { UniswapContract } from "@aztec/noir-contracts/types";
import { beforeAll, expect, jest } from "@jest/globals";
import { UniswapPortalAbi, UniswapPortalBytecode, delay, deployL1Contract } from "./fixtures/utils.js";
import { mnemonicToAccount } from "viem/accounts";

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;
const MNEMONIC = 'test test test test test test test test test test test junk';
const hdAccount = mnemonicToAccount(MNEMONIC);
const expectedForkBlockNumber = 17514288;

#include_code uniswap_l1_l2_test_setup_const yarn-project/end-to-end/src/canary/uniswap_l1_l2.ts typescript raw
#include_code uniswap_setup yarn-project/canary/src/uniswap_trade_on_l1_from_l2.test.ts typescript raw
#include_code uniswap_l1_l2_test_beforeAll yarn-project/end-to-end/src/canary/uniswap_l1_l2.ts typescript raw
```
## Private flow test
#include_code uniswap_private yarn-project/end-to-end/src/canary/uniswap_l1_l2.ts typescript

## Public flow test
#include_code uniswap_public yarn-project/end-to-end/src/canary/uniswap_l1_l2.ts typescript

## Running the test
Run the sandbox:
```bash
cd ~/.aztec && docker-compose up
```

In a separate terminal:
```bash
cd packages/src
yarn test uniswap
```
