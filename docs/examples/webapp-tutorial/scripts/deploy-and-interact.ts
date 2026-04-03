// docs:start:script-setup
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
// @ts-ignore — generated artifact, may not exist until compiled
import { PodRacingContract } from "../src/artifacts/PodRacing.js";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const wallet = await EmbeddedWallet.create(nodeUrl, { ephemeral: true });

const [alice, bob] = await getInitialTestAccountsData();
await wallet.createSchnorrAccount(alice.secret, alice.salt);
await wallet.createSchnorrAccount(bob.secret, bob.salt);
console.log("Accounts ready:", alice.address.toString(), bob.address.toString());
// docs:end:script-setup

// docs:start:script-deploy
const { contract } = await PodRacingContract.deploy(wallet, alice.address).send({
  from: alice.address,
});
console.log("Contract deployed at:", contract.address.toString());
// docs:end:script-deploy

// docs:start:script-create-join
const gameId = 1n;
await contract.methods.create_game(gameId).send({ from: alice.address });
console.log("Game created");

await contract.methods.join_game(gameId).send({ from: bob.address });
console.log("Bob joined the game");
// docs:end:script-create-join

// docs:start:script-play-rounds
// Round 1
await contract.methods
  .play_round(gameId, 1, 3, 2, 1, 2, 1)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 1, 1, 1, 3, 2, 2)
  .send({ from: bob.address });

// Round 2
await contract.methods
  .play_round(gameId, 2, 2, 3, 1, 1, 2)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 2, 2, 2, 2, 2, 1)
  .send({ from: bob.address });

// Round 3
await contract.methods
  .play_round(gameId, 3, 1, 1, 2, 3, 2)
  .send({ from: alice.address });
await contract.methods
  .play_round(gameId, 3, 3, 1, 1, 1, 3)
  .send({ from: bob.address });
console.log("All rounds played");
// docs:end:script-play-rounds

// docs:start:script-finish-finalize
await contract.methods.finish_game(gameId).send({ from: alice.address });
await contract.methods.finish_game(gameId).send({ from: bob.address });
console.log("Both players revealed scores");

await contract.methods.finalize_game(gameId).send({ from: alice.address });
console.log("Game finalized! Winner determined.");
// docs:end:script-finish-finalize
