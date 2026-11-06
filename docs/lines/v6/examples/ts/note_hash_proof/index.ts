import circuit from "../../../target/note_hash_proof.json" with { type: "json" };
import assert from "node:assert";

// docs:start:create_note
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing";
import { Fr } from "@aztec-labs/aztec.js/fields";
import { createAztecNodeClient, waitForNode } from "@aztec-labs/aztec.js/node";
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded";
import { NoteHashProofContract } from "./artifacts/NoteHashProof.js";

const nodeUrl = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";
const node = createAztecNodeClient(nodeUrl);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

const [aliceData] = await getInitialTestAccountsData();
const alice = await wallet.createSchnorrInitializerlessAccount(
  aliceData.secret,
  aliceData.salt,
  aliceData.signingKey,
);

const { contract } = await NoteHashProofContract.deploy(wallet).send({
  from: alice.address,
});

// The randomness is a private argument: it never leaves this machine, and it must be fresh for every note.
const value = 69n;
const randomness = Fr.random();
const { receipt } = await contract.methods
  .create_note(value, randomness)
  .send({ from: alice.address });
// docs:end:create_note

// docs:start:check_delivery
const { result: balance } = await contract.methods
  .balance_of(alice.address)
  .simulate({ from: alice.address });
assert.equal(balance, value);
// docs:end:check_delivery

// docs:start:find_note_hash
import { computeNoteHashNonce } from "@aztec-labs/stdlib/hash";

const { txEffect } = await node.getTxReceipt(receipt.txHash, {
  includeTxEffect: true,
});
if (!txEffect) {
  throw new Error(`Transaction ${receipt.txHash} has no effect yet`);
}
// The nonce depends on the note's position among the transaction's note hashes; this transaction creates one note.
assert.equal(txEffect.noteHashes.length, 1);
const settledNoteHash = txEffect.noteHashes[0];
const noteNonce = await computeNoteHashNonce(txEffect.nullifiers[0], 0);
// docs:end:find_note_hash

// docs:start:prove
import { Barretenberg, UltraHonkBackend } from "@aztec-foundation/bb.js";
import { Noir } from "@aztec-foundation/noir-noir_js";

const inputs = {
  settled_note_hash: settledNoteHash.toString(),
  contract_address: contract.address.toString(),
  owner: alice.address.toString(),
  value: value.toString(),
  randomness: randomness.toString(),
  storage_slot: NoteHashProofContract.storage.notes.slot.toString(),
  note_nonce: noteNonce.toString(),
};

const noir = new Noir(circuit as any);
const { witness } = await noir.execute(inputs);

const api = await Barretenberg.new({ threads: 1 });
const backend = new UltraHonkBackend(circuit.bytecode, api);
const proof = await backend.generateProof(witness);
const verified = await backend.verifyProof(proof);
console.log(`Proof verified: ${verified}`);
await api.destroy();
// docs:end:prove
assert.ok(verified);

// docs:start:wrong_randomness
await assert.rejects(
  noir.execute({ ...inputs, randomness: Fr.random().toString() }),
);
// docs:end:wrong_randomness
