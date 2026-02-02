// docs:start:setup
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";

const nodeUrl = "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
const wallet = await TestWallet.create(node);

const [alice, bob] = await getInitialTestAccountsData();
await wallet.createSchnorrAccount(alice.secret, alice.salt);
await wallet.createSchnorrAccount(bob.secret, bob.salt);
// docs:end:setup

// docs:start:deploy
import { TokenContract } from "@aztec/noir-contracts.js/Token";

const token = await TokenContract.deploy(
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
let aliceBalance = await token.methods
  .balance_of_private(alice.address)
  .simulate({ from: alice.address });
console.log(`Alice's balance: ${aliceBalance}`);
let bobBalance = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:check_balances

// docs:start:transfer
await token.methods.transfer(bob.address, 10).send({ from: alice.address });
bobBalance = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:transfer

// docs:start:set_minter
await token.methods.set_minter(bob.address, true).send({ from: alice.address });
// docs:end:set_minter

// docs:start:bob_mints
await token.methods
  .mint_to_private(bob.address, 100)
  .send({ from: bob.address });
bobBalance = await token.methods
  .balance_of_private(bob.address)
  .simulate({ from: bob.address });
console.log(`Bob's balance: ${bobBalance}`);
// docs:end:bob_mints
