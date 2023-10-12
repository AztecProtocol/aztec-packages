---
title: Deploy & Call Contracts with Typescript
---

So far we have written our solidity and aztec-nr functions to deposit and withdraw tokens between L1 and L2. But we haven't yet interacted with the sandbox to actually execute the code and see the tokens being bridged. We will now write a test to interact with the sandbox and see the expected results!

In the root folder, go to `packages/src` folder where we added `jest`:
```bash
cd packages/src
mkdir test && cd test
touch cross_chain_messaging.test.ts
```

Open cross_chain_messaging.test.ts:

We will write two tests:
1. Test the deposit and withdraw in the private flow
2. Do the same in the public flow

## Test imports and setup
We need some helper files that can keep our code clean:

```bash
mkdir fixtures
touch utils.ts
touch cross_chain_test_harness.ts
```

In `utils.ts`, put:
```typescript
import * as fs from 'fs';
import { AztecAddress, EthAddress, TxStatus, Wallet } from "@aztec/aztec.js";
import { TokenBridgeContract, TokenContract } from "@aztec/noir-contracts/types";
import { Account, Chain, Hex, HttpTransport, PublicClient, WalletClient, getContract } from "viem";
import type { Abi, Narrow } from 'abitype';

const PATH = "../../packages/l1-contracts/artifacts/contracts";
const EXT = ".sol"
function getL1ContractABIAndBytecode(contractName: string) {
  const pathToArtifact = `${PATH}/${contractName}${EXT}/${contractName}.json`;
  const artifacts = JSON.parse(fs.readFileSync(pathToArtifact, 'utf-8'));
  return [artifacts.abi, artifacts.bytecode];
}

const [PortalERC20Abi, PortalERC20Bytecode] = getL1ContractABIAndBytecode("PortalERC20");
const [TokenPortalAbi, TokenPortalBytecode] = getL1ContractABIAndBytecode("TokenPortal");

#include_code deployL1Contract /yarn-project/ethereum/src/deploy_l1_contracts.ts typescript raw
#include_code deployAndInitializeTokenAndBridgeContracts /yarn-project/end-to-end/src/fixtures/utils.ts typescript raw
#include_code delay /yarn-project/end-to-end/src/fixtures/utils.ts typescript raw
```

This code
- gets your solidity contract ABIs, 
- uses viem to deploy them to Ethereum, 
- uses aztec.js to deploy the token and token bridge contract on L2, sets the bridge's portal address to `tokenPortalAddress` and initialises all the contracts

Now let's create another util file to can handle interaction with these contracts to mint/deposit the functions:

In `cross_chain_test_harness.ts`, put:

#include_code cross_chain_test_harness /yarn-project/end-to-end/src/fixtures/cross_chain_test_harness.ts typescript

This is just a class that holds all contracts as objects and exposes easy to use helper methods to interact with our contracts. Take a moment of review everything here!

Okay now we are ready to write our tests:

open `cross_chain_messaging.test.ts` and lets do the initial description of the test:
```typescript
import { expect, jest} from '@jest/globals'
import { AccountWallet, AztecAddress, DebugLogger, EthAddress, Fr, computeAuthWitMessageHash, createDebugLogger, createPXEClient, getSandboxAccountsWallets, waitForSandbox } from '@aztec/aztec.js';
import { TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';

import { CrossChainTestHarness } from './fixtures/cross_chain_test_harness.js';
import { delay } from './fixtures/utils.js';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http } from 'viem';
import { foundry } from 'viem/chains';

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;
const MNEMONIC = 'test test test test test test test test test test test junk';
const hdAccount = mnemonicToAccount(MNEMONIC);

describe('e2e_cross_chain_messaging', () => {
  jest.setTimeout(90_000);

  let logger: DebugLogger;
  // include code:
  let user1Wallet: AccountWallet;
  let user2Wallet: AccountWallet;
  let ethAccount: EthAddress;
  let ownerAddress: AztecAddress;

  let crossChainTestHarness: CrossChainTestHarness;
  let l2Token: TokenContract;
  let l2Bridge: TokenBridgeContract;
  let outbox: any;

  beforeEach(async () => {
    logger = createDebugLogger('aztec:canary_uniswap');
    const pxe = createPXEClient(PXE_URL);
    await waitForSandbox(pxe);
    const wallets = await getSandboxAccountsWallets(pxe);

    const walletClient = createWalletClient({
      account: hdAccount,
      chain: foundry,
      transport: http(ETHEREUM_HOST),
    });
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(ETHEREUM_HOST),
    });

    crossChainTestHarness = await CrossChainTestHarness.new(
      pxe,
      publicClient,
      walletClient,
      wallets[0],
      logger,
    );

    l2Token = crossChainTestHarness.l2Token;
    l2Bridge = crossChainTestHarness.l2Bridge;
    ethAccount = crossChainTestHarness.ethAccount;
    ownerAddress = crossChainTestHarness.ownerAddress;
    outbox = crossChainTestHarness.outbox;
    user1Wallet = wallets[0];
    user2Wallet = wallets[1];
    logger = logger;
    logger('Successfully deployed contracts and initialized portal');
  });
```

This fetches the wallets from the sandbox and deploys our cross chain harness on the sandbox!
## Private flow test
#include_code e2e_private_cross_chain /yarn-project/end-to-end/src/e2e_cross_chain_messaging.test.ts

## Public flow test
#include_code e2e_public_cross_chain /yarn-project/end-to-end/src/e2e_public_cross_chain_messaging.test.ts

## Running the test
```bash
cd packages/src
yarn test
```

## Jest error
Note - you might have a jest error at the end of each test saying "expected 1-2 arguments but got 3". In case case simply remove the "120_000" at the end of each test. We have already set the timeout at the top so this shouldn't be a problem.