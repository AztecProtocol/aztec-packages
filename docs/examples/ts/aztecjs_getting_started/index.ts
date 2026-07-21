// docs:start:setup
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });

const [alice, bob] = await getInitialTestAccountsData();
await wallet.createSchnorrInitializerlessAccount(
  alice.secret,
  alice.salt,
  alice.signingKey,
);
await wallet.createSchnorrInitializerlessAccount(
  bob.secret,
  bob.salt,
  bob.signingKey,
);
// docs:end:setup

// docs:start:deploy
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const { contract: token } = await TokenContract.deploy(
  wallet,
  alice.address,
  "TokenName",
  "TKN",
  18,
).send({ from: alice.address });
// docs:end:deploy

// docs:start:mint
await token.methods
  .mint_to_private(alice.address, 100)
  .send({ from: alice.address });
// docs:end:mint

// docs:start:check_balances
let { result: aliceBalance } = await token.methods
  .balance_of_private(alice.address)
  .simulate({ from: alice.address });
console.log(`Alice's balance: ${aliceBalance}`);
let { result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:check_balances

// docs:start:transfer
await token.methods.transfer(bob.address, 10).send({ from: alice.address });
({ result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address }));
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:transfer

// docs:start:set_minter
await token.methods.set_minter(bob.address, true).send({ from: alice.address });
// docs:end:set_minter

// docs:start:bob_mints
await token.methods
  .mint_to_private(bob.address, 100)
  .send({ from: bob.address });
({ result: bobBalance } = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address }));
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:bob_mints
