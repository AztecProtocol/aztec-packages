// docs:start:imports
import { OffchainTransferContract } from "./artifacts/OffchainTransfer.js";
import { TokenContract } from "@aztec/noir-contracts.js/Token";
import { createAztecNodeClient, waitForNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { Fr } from "@aztec/aztec.js/fields";
import { SetPublicAuthwitContractInteraction } from "@aztec/aztec.js/authorization";
import { Schnorr } from "@aztec/foundation/crypto/schnorr";
import { poseidon2HashWithSeparator } from "@aztec/foundation/crypto/poseidon";
import { GrumpkinScalar } from "@aztec/foundation/curves/grumpkin";
// docs:end:imports

// docs:start:constants
// These must match the values in the Noir contract and its dependencies.
const MESSAGE_HASH_SEPARATOR = 2;
// From noir-protocol-circuits/crates/types/src/constants.nr: DOM_SEP__NOTE_HASH
// Used by uint_note's compute_partial_commitment.
const DOM_SEP_NOTE_HASH = 116501019;
// docs:end:constants

// docs:start:helpers
/**
 * Computes the partial note commitment the same way uint_note's compute_partial_commitment does.
 * commitment = poseidon2_hash_with_separator([owner, randomness], DOM_SEP__NOTE_HASH)
 *
 * This lets the recipient know the commitment offchain (before Bob signs it) without needing to
 * query the PXE for the transaction's private return values.
 */
async function computePartialCommitment(
  owner: { toField: () => Fr },
  randomness: Fr,
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [owner.toField(), randomness],
    DOM_SEP_NOTE_HASH,
  );
}
// docs:end:helpers

// docs:start:setup
// Connect to the local network.
const node = createAztecNodeClient(
  process.env.AZTEC_NODE_URL ?? "http://localhost:8080",
);
await waitForNode(node);
const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

// Set up three accounts: Admin (token minter), Bob (sender), Carol (recipient).
const testAccounts = await getInitialTestAccountsData();
const [adminAddress, bobAddress, carolAddress] = await Promise.all(
  testAccounts.slice(0, 3).map(async (account) => {
    return (
      await wallet.createSchnorrAccount(
        account.secret,
        account.salt,
        account.signingKey,
      )
    ).address;
  }),
);

// Deploy the token contract.
const { contract: token } = await TokenContract.deploy(
  wallet,
  adminAddress,
  "TestToken",
  "TST",
  18,
).send({ from: adminAddress });

// Deploy the offchain transfer contract.
const { contract: offchainTransfer } = await OffchainTransferContract.deploy(
  wallet,
  token.address,
).send({ from: adminAddress });

// Mint tokens to Bob (public).
await token.methods
  .mint_to_public(bobAddress, 1000n)
  .send({ from: adminAddress });
// docs:end:setup

// docs:start:bob_signing_key
// Bob generates a Schnorr signing keypair. This is a DIFFERENT key from his Aztec account key.
// This is the key he will use to sign authorizations offchain. The private key never touches the network.
const schnorr = new Schnorr();
const bobSigningPrivateKey = GrumpkinScalar.random();
const bobSigningPublicKey = await schnorr.computePublicKey(bobSigningPrivateKey);

// Bob registers his signing public key with the contract.
await offchainTransfer.methods
  .register_signing_key(bobSigningPublicKey.x, bobSigningPublicKey.y)
  .send({ from: bobAddress });
// docs:end:bob_signing_key

// docs:start:bob_deposit
// Bob deposits 500 tokens into the contract. He must first authorize the contract to move his tokens.
const depositAmount = 500n;

const authwitNonce = Fr.random();
const depositAction = token.methods.transfer_in_public(
  bobAddress,
  offchainTransfer.address,
  depositAmount,
  authwitNonce,
);
const depositAuthwit = await SetPublicAuthwitContractInteraction.create(
  wallet,
  bobAddress,
  { caller: offchainTransfer.address, action: depositAction },
  true,
);
await depositAuthwit.send();

// Bob calls deposit, which transfers his tokens into the contract and credits his balance.
await offchainTransfer.methods
  .deposit(depositAmount, authwitNonce)
  .send({ from: bobAddress });

console.log(`Bob deposited ${depositAmount} tokens`);
// docs:end:bob_deposit

// docs:start:carol_creates_claim
// Carol wants to be paid. She creates a partial note for herself, to be funded from Bob's deposit.
// She generates her own randomness so the commitment is deterministic: she knows the commitment
// immediately without needing to query the PXE after the transaction lands.
const randomness = Fr.random();
const commitment = await computePartialCommitment(carolAddress, randomness);

// Carol submits tx 1: a private transaction that creates the partial note with her chosen randomness.
await offchainTransfer.methods
  .create_claim(randomness)
  .send({ from: carolAddress });

console.log(`Carol created partial note with commitment: ${commitment.toString()}`);
// docs:end:carol_creates_claim

// docs:start:bob_signs_offchain
// Carol sends the commitment to Bob through any offchain channel (message, QR code, etc.).
// She also tells Bob how much she wants to claim. Bob constructs the message hash and signs it.
// This happens ENTIRELY OFFCHAIN. Bob never submits a transaction to authorize this payment.
const claimAmount = 100n;

const messageHash = await poseidon2HashWithSeparator(
  [offchainTransfer.address.toField(), bobAddress.toField(), commitment, new Fr(claimAmount)],
  MESSAGE_HASH_SEPARATOR,
);
const signature = await schnorr.constructSignature(
  messageHash.toBuffer(),
  bobSigningPrivateKey,
);

// Bob sends the signature back to Carol through the same offchain channel.
console.log(`Bob signed authorization for ${claimAmount} tokens offchain`);
// docs:end:bob_signs_offchain

// docs:start:carol_completes
// Carol submits tx 2: a transaction that verifies Bob's signature (in private, because Schnorr's
// internal Blake2s is not supported by the AVM), then deducts from Bob's balance and completes the
// partial note in public. Anyone could submit this transaction.
//
// Carol passes Bob's signing public key as arguments. The public phase re-validates that this
// key matches the one Bob registered for himself, so there's no way to forge the claim by
// passing a different key.
await offchainTransfer.methods
  .claim_with_signature(
    bobAddress,
    { commitment },
    claimAmount,
    signature.toBuffer(),
    bobSigningPublicKey.x,
    bobSigningPublicKey.y,
  )
  .send({ from: carolAddress });
// docs:end:carol_completes

// docs:start:verify
// Check Carol's private balance: she should have received `claimAmount` tokens.
const { result: carolBalance } = await offchainTransfer.methods
  .get_private_balance(carolAddress)
  .simulate({ from: carolAddress });

console.log(`Carol's private balance: ${carolBalance}`);
if (carolBalance !== claimAmount) {
  throw new Error(
    `Expected Carol to have ${claimAmount}, got ${carolBalance}`,
  );
}

// Check that Bob's deposit balance decreased by the claim amount.
const { result: bobDepositBalance } = await offchainTransfer.methods
  .get_deposit_balance(bobAddress)
  .simulate({ from: bobAddress });

const expectedBobBalance = depositAmount - claimAmount;
console.log(`Bob's deposit balance: ${bobDepositBalance}`);
if (bobDepositBalance !== expectedBobBalance) {
  throw new Error(
    `Expected Bob to have ${expectedBobBalance}, got ${bobDepositBalance}`,
  );
}

console.log("Offchain transfer completed successfully");
// docs:end:verify
