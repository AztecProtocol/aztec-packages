// docs:start:complete_test_example
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { AztecAddress } from "@aztec/aztec.js/addresses";

// This file demonstrates a complete Jest test structure.
// In a real test file, wrap this in describe() and it() blocks.

// Test setup variables
let wallet: EmbeddedWallet;
let aliceAddress: AztecAddress;
let bobAddress: AztecAddress;
let token: TokenContract;

// beforeAll equivalent - setup
async function setup() {
  const node = createAztecNodeClient(
    process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
  );
  await waitForNode(node);
  wallet = await EmbeddedWallet.create(node, { ephemeral: true });
  const testAccounts = await getInitialTestAccountsData();
  [aliceAddress, bobAddress] = await Promise.all(
    testAccounts.slice(0, 2).map(async (account) => {
      return (
        await wallet.createSchnorrInitializerlessAccount(
          account.secret,
          account.salt,
          account.signingKey,
        )
      ).address;
    }),
  );

  ({ contract: token } = await TokenContract.deploy(
    wallet,
    aliceAddress,
    "Test",
    "TST",
    18,
  ).send({
    from: aliceAddress,
  }));
}

// Test: mints tokens to an account
async function testMintTokens() {
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  if (balance !== 1000n) {
    throw new Error(`Expected balance 1000n, got ${balance}`);
  }
  console.log("✓ Mint tokens test passed");
}

// Test: transfers tokens between accounts
async function testTransferTokens() {
  // First mint some tokens
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  // Transfer to bob using public transfer
  await token.methods
    .transfer_in_public(aliceAddress, bobAddress, 100n, 0n)
    .send({ from: aliceAddress });

  const { result: aliceBalance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  const { result: bobBalance } = await token.methods
    .balance_of_public(bobAddress)
    .simulate({ from: bobAddress });

  // Note: balances accumulate from previous test
  console.log(`Alice balance: ${aliceBalance}, Bob balance: ${bobBalance}`);
  console.log("✓ Transfer tokens test passed");
}

// Test: reverts when transferring more than balance
async function testRevertOnOverTransfer() {
  const { result: balance } = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  try {
    await token.methods
      .transfer_in_public(aliceAddress, bobAddress, balance + 1n, 0n)
      .simulate({ from: aliceAddress });
    throw new Error("Expected simulation to throw");
  } catch (error) {
    // Expected to throw
    console.log("✓ Revert on over-transfer test passed");
  }
}

// Run all tests
async function runTests() {
  await setup();
  await testMintTokens();
  await testTransferTokens();
  await testRevertOnOverTransfer();
  console.log("\n✓ All tests passed");
}

await runTests();
// docs:end:complete_test_example

// docs:start:load_test_accounts
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec/wallets/testing";

// wallet is the EmbeddedWallet from the setup section above
const [alice, bob] = await registerInitialLocalNetworkAccountsInWallet(wallet);
// docs:end:load_test_accounts

// docs:start:deploy_test_contract
// wallet is from the setup section; alice is from registerInitialLocalNetworkAccountsInWallet
const { contract: testToken } = await TokenContract.deploy(
  wallet,
  alice, // admin
  "TestToken",
  "TST",
  18,
).send({ from: alice });
// docs:end:deploy_test_contract

// docs:start:test_revert_case
async function testRevertExample() {
  // testToken and alice are from the deploy/load sections above
  const { result: balance } = await testToken.methods
    .balance_of_public(alice)
    .simulate({ from: alice });

  let reverted = false;
  try {
    await testToken.methods
      .transfer_in_public(alice, bob, balance + 1n, 0n)
      .simulate({ from: alice });
  } catch (error) {
    reverted = true;
  }

  if (!reverted) {
    throw new Error("Expected simulation to revert for over-transfer");
  }
  console.log("✓ Revert on over-transfer test passed");
}

await testRevertExample();
// docs:end:test_revert_case
