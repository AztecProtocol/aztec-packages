import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { Fr } from "@aztec/aztec.js/fields";
import { SetPublicAuthwitContractInteraction } from "@aztec/aztec.js/authorization";

// Setup: connect to network and deploy a token contract
const node = createAztecNodeClient(
  process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

const testAccounts = await getInitialTestAccountsData();
const [aliceAddress, bobAddress] = await Promise.all(
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

const { contract: tokenContract } = await TokenContract.deploy(
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
  call: await privateAction.getFunctionCall(),
});

// Bob executes the transfer, providing the authwit
// additionalScopes lets the PXE access Alice's private state
// during authwit verification
await privateAction.send({
  from: bobAddress,
  authWitnesses: [privateWitness],
  additionalScopes: [aliceAddress],
});
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
const authwit = await SetPublicAuthwitContractInteraction.create(
  wallet,
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
const setAuthwit = await SetPublicAuthwitContractInteraction.create(
  wallet,
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  true,
);
await setAuthwit.send();

// Later, revoke it
const revokeInteraction = await SetPublicAuthwitContractInteraction.create(
  wallet,
  aliceAddress,
  { caller: bobAddress, action: revokeAction },
  false, // revoke authorization
);
await revokeInteraction.send();
// docs:end:revoke_authwit

console.log("All authwit examples completed successfully");
