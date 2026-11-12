// docs:start:full
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import { CounterContract } from "./artifacts/Counter.js";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });

// The local network funds its test accounts, so they pay fees without being deployed first.
const [aliceData] = await getInitialTestAccountsData();
const alice = await wallet.createSchnorrInitializerlessAccount(
  aliceData.secret,
  aliceData.salt,
  aliceData.signingKey,
);

const { contract: counter } = await CounterContract.deploy(
  wallet,
  10,
  alice.address,
).send({ from: alice.address });
console.log(`Counter deployed at ${counter.address}`);

await counter.methods.increment(alice.address).send({ from: alice.address });

const { result: value } = await counter.methods
  .get_counter(alice.address)
  .simulate({ from: alice.address });
console.log(`Counter value: ${value}`);
// docs:end:full

if (value !== 11n) {
  throw new Error(`Expected the counter to be 11, got ${value}`);
}
