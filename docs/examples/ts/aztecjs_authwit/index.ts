import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import {
  TestWallet,
  registerInitialLocalNetworkAccountsInWallet,
} from "@aztec/test-wallet/server";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { Fr } from "@aztec/aztec.js/fields";

// Setup: connect to network and deploy a token contract
const node = createAztecNodeClient("http://localhost:8080");
await waitForNode(node);
const wallet = await TestWallet.create(node);

const [aliceAddress, bobAddress] =
  await registerInitialLocalNetworkAccountsInWallet(wallet);

const tokenContract = await TokenContract.deploy(
  wallet,
  aliceAddress,
  "TestToken",
  "TST",
  18,
).send({ from: aliceAddress });

// Mint tokens to Alice for the examples
await tokenContract.methods
  .mint_to_private(aliceAddress, 1000n)
  .send({ from: aliceAddress });

await tokenContract.methods
  .mint_to_public(aliceAddress, 1000n)
  .send({ from: aliceAddress });

// docs:start:private_authwit
// Alice wants to allow Bob to transfer tokens from her account (private)
const privateNonce = Fr.random();

// Define the action Bob will execute
const privateAction = tokenContract.methods.transfer_in_private(
  aliceAddress, // from
  bobAddress, // to
  100n, // amount
  privateNonce, // authwit nonce for replay protection
);

// Alice creates an authwit authorizing Bob to call this function
const privateWitness = await wallet.createAuthWit(aliceAddress, {
  caller: bobAddress,
  action: privateAction,
});

// Bob executes the transfer, providing the authwit
await privateAction.send({ from: bobAddress, authWitnesses: [privateWitness] });
// docs:end:private_authwit

// docs:start:public_authwit
// Alice wants to allow Bob to transfer tokens from her account (public)
const publicNonce = Fr.random();

// Define the action Bob will execute
const publicAction = tokenContract.methods.transfer_in_public(
  aliceAddress, // from
  bobAddress, // to
  100n, // amount
  publicNonce, // authwit nonce
);

// Alice sets the public authwit (this requires a transaction)
const authwit = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: publicAction },
  true, // authorized
);
await authwit.send();

// Now Bob can execute the transfer
await publicAction.send({ from: bobAddress });
// docs:end:public_authwit

// docs:start:arbitrary_authwit
import { computeInnerAuthWitHash } from "@aztec/aztec.js/authorization";

// Create hash of arbitrary data
const innerHash = await computeInnerAuthWitHash([
  Fr.fromHexString("0xcafe"),
  Fr.fromHexString("0xbeef"),
]);

// Create an intent with the consumer contract address
const intent = {
  consumer: tokenContract.address,
  innerHash,
};

// Create the authwit for arbitrary data
const arbitraryWitness = await wallet.createAuthWit(aliceAddress, intent);
console.log("Arbitrary authwit created:", arbitraryWitness);
// docs:end:arbitrary_authwit

// docs:start:revoke_authwit
// Revoke a public authwit by setting authorized to false
const revokeNonce = Fr.random();
const revokeAction = tokenContract.methods.transfer_in_public(
  aliceAddress,
  bobAddress,
  50n,
  revokeNonce,
);

// First, set the authwit
const setAuthwit = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  true,
);
await setAuthwit.send();

// Later, revoke it
const revokeInteraction = await wallet.setPublicAuthWit(
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  false, // revoke authorization
);
await revokeInteraction.send();
// docs:end:revoke_authwit

console.log("All authwit examples completed successfully");
