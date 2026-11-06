// docs:start:create_wallets
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);

// Each wallet runs its own PXE, with its own keys, notes and registered contracts.
const aliceWallet = await EmbeddedWallet.create(node, { ephemeral: true });
const bobWallet = await EmbeddedWallet.create(node, { ephemeral: true });
// docs:end:create_wallets

// docs:start:load_accounts
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";

const [aliceData, bobData] = await getInitialTestAccountsData();
const alice = await aliceWallet.createSchnorrInitializerlessAccount(
  aliceData.secret,
  aliceData.salt,
  aliceData.signingKey,
);
const bob = await bobWallet.createSchnorrInitializerlessAccount(
  bobData.secret,
  bobData.salt,
  bobData.signingKey,
);
// docs:end:load_accounts

// docs:start:register_sender
await bobWallet.registerSender(alice.address, "alice");
// docs:end:register_sender

// docs:start:deploy_and_mint
import { TokenContract } from "@aztec-labs/noir-contracts.js/Token";

const { contract: aliceToken } = await TokenContract.deploy(
  aliceWallet,
  alice.address,
  "TokenName",
  "TKN",
  18,
).send({ from: alice.address });

await aliceToken.methods
  .mint_to_private(bob.address, 100)
  .send({ from: alice.address });
await aliceToken.methods
  .mint_to_public(bob.address, 100)
  .send({ from: alice.address });
// docs:end:deploy_and_mint

// docs:start:register_contract
const tokenInstance = await node.getContract(aliceToken.address);
if (!tokenInstance) {
  throw new Error(`Token ${aliceToken.address} is not deployed`);
}
await bobWallet.registerContract(tokenInstance, TokenContract.artifact);
const bobToken = await TokenContract.at(aliceToken.address, bobWallet);
// docs:end:register_contract

// docs:start:read_balances
const { result: privateBalance } = await bobToken.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
const { result: publicBalance } = await bobToken.methods
  .balance_of_public(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's private balance: ${privateBalance}`);
console.log(`Bob's public balance: ${publicBalance}`);
// docs:end:read_balances

if (privateBalance !== 100n || publicBalance !== 100n) {
  throw new Error(
    `Expected 100 private and 100 public, got ${privateBalance} and ${publicBalance}`,
  );
}
