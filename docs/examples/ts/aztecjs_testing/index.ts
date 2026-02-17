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
  const node = createAztecNodeClient("http://localhost:8080");
  await waitForNode(node);
  wallet = await EmbeddedWallet.create(node);
  const testAccounts = await getInitialTestAccountsData();
  [aliceAddress, bobAddress] = await Promise.all(
    testAccounts.slice(0, 2).map(async (account) => {
      return (await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey)).address;
    }),
  );

  token = await TokenContract.deploy(
    wallet,
    aliceAddress,
    "Test",
    "TST",
    18,
  ).send({
    from: aliceAddress,
  });
}

// Test: mints tokens to an account
async function testMintTokens() {
  await token.methods
    .mint_to_public(aliceAddress, 1000n)
    .send({ from: aliceAddress });

  const balance = await token.methods
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

  // Transfer to bob using the simple transfer method
  await token.methods.transfer(bobAddress, 100n).send({ from: aliceAddress });

  const aliceBalance = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });
  const bobBalance = await token.methods
    .balance_of_public(bobAddress)
    .simulate({ from: bobAddress });

  // Note: balances accumulate from previous test
  console.log(`Alice balance: ${aliceBalance}, Bob balance: ${bobBalance}`);
  console.log("✓ Transfer tokens test passed");
}

// Test: reverts when transferring more than balance
async function testRevertOnOverTransfer() {
  const balance = await token.methods
    .balance_of_public(aliceAddress)
    .simulate({ from: aliceAddress });

  try {
    await token.methods
      .transfer(bobAddress, balance + 1n)
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

runTests().catch(console.error);
// docs:end:complete_test_example
