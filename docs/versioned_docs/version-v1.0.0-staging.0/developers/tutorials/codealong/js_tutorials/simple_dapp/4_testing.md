---
title: Testing
---

To wrap up this tutorial, we'll set up a simple automated test for our dapp contracts. We will be using [jest](https://jestjs.io/), but any nodejs test runner works fine.

Here we'll only test the happy path for a `transfer` on our private token contract, but in a real application you should be testing both happy and unhappy paths, as well as both your contracts and application logic.

## Dependencies

Start by installing our test runner, in this case jest:

```sh
yarn add -D jest
```

We'll need to [install and run the Sandbox](../../../../getting_started.md).

## Test setup

Create a new file `src/index.test.mjs` with the imports we'll be using and an empty test suite to begin with:

```js
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

const {
  PXE_URL = "http://localhost:8080",
  ETHEREUM_HOSTS = "http://localhost:8545",
} = process.env;

describe("token contract", () => {
  // <tests go here>
});
```

Let's set up our test suite. We'll make sure the Sandbox is running, create two fresh accounts to test with, and deploy an instance of our contract. `aztec.js` provides the helper functions we need to do this:

```javascript title="setup" showLineNumbers 
let owner, recipient, token;

beforeAll(async () => {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  [owner, recipient] = await getDeployedTestAccountsWallets(pxe);

  const initialBalance = 69;
  token = await TokenContract.deploy(owner, owner.getAddress(), 'TokenName', 'TokenSymbol', 18).send().deployed();
  await token.methods.mint_to_private(owner.getAddress(), owner.getAddress(), initialBalance).send().wait();
}, 120_000);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.test.mjs#L13-L25" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.test.mjs#L13-L25</a></sub></sup>


:::tip
Instead of creating new accounts in our test suite, we can use the ones already initialized by the Sandbox upon startup. This can provide a speed boost to your tests setup. However, bear in mind that you may accidentally introduce an interdependency across test suites by reusing the same accounts.
:::

## Writing our test

Now that we have a working test environment, we can write our first test for exercising the `transfer` function on the token contract. We will use the same `aztec.js` methods we used when building our dapp:

```javascript title="test" showLineNumbers 
it('increases recipient funds on transfer', async () => {
  expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(0n);
  await token.methods.transfer(recipient.getAddress(), 20).send().wait();
  expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(
    20n,
  );
}, 30_000);
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v1.0.0-staging.0/yarn-project/end-to-end/src/sample-dapp/index.test.mjs#L27-L35" target="_blank" rel="noopener noreferrer">Source code: yarn-project/end-to-end/src/sample-dapp/index.test.mjs#L27-L35</a></sub></sup>


In this example, we assert that the `recipient`'s balance is increased by the amount transferred. We could also test that the `owner`'s funds are decremented by the same amount, or that a transaction that attempts to send more funds than those available would fail.

## Running our tests

We can run our `jest` tests using `yarn`. The quirky syntax is due to [jest limitations in ESM support](https://jestjs.io/docs/ecmascript-modules), as well as not picking up `mjs` file by default:

```sh
yarn node --experimental-vm-modules $(yarn bin jest) --testRegex '.*\.test\.mjs$'
```

## Next steps

Have you written a contract from scratch? If not, follow a tutorial for [writing contracts with Noir](../../contract_tutorials/counter_contract.md)

Or read about the [fundamental concepts behind Aztec Network](../../../../../aztec) and dive deeper into how things work.
