// docs:start:imports
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import type { FieldLike } from "@aztec/aztec.js/abi";
import { getSponsoredFPCInstance } from "./scripts/sponsored_fpc.js";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { ValueNotEqualContract } from "./artifacts/ValueNotEqual.js";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import assert from "node:assert";
import { Fr } from "@aztec/aztec.js/fields";
// docs:end:imports

// docs:start:sample_data
// Sample proof data - in production this comes from generate_data.ts
// These are placeholder values for type-checking purposes
const data = {
  vkAsFields: [] as string[],
  vkHash: "0x0",
  proofAsFields: [] as string[],
  publicInputs: ["2"],
};
// docs:end:sample_data

export const NODE_URL = "http://localhost:8080";

// docs:start:setup_wallet
// Setup sponsored fee payment - the FPC pays transaction fees for us
const sponsoredFPC = await getSponsoredFPCInstance();
const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
  sponsoredFPC.address,
);

// Initialize wallet and connect to local network
// The wallet manages accounts and sends transactions through the PXE
export const setupWallet = async (): Promise<EmbeddedWallet> => {
  try {
    // Create wallet with embedded PXE
    const wallet = await EmbeddedWallet.create(NODE_URL);

    // Register the sponsored FPC so the wallet knows about it
    await wallet.registerContract(sponsoredFPC, SponsoredFPCContract.artifact);
    return wallet;
  } catch (error) {
    console.error("Failed to setup local network:", error);
    throw error;
  }
};
// docs:end:setup_wallet

// docs:start:main
async function main() {
  // Step 1: Setup wallet and create account
  // Accounts in Aztec are smart contracts (account abstraction)
  const wallet = await setupWallet();
  const account = await wallet.createSchnorrAccount(Fr.random(), Fr.random());
  const manager = await account.getDeployMethod();

  // Deploy the account contract
  await manager.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod: sponsoredPaymentMethod },
  });

  const accounts = await wallet.getAccounts();

  // Step 2: Deploy ValueNotEqual contract
  // Constructor args: initial counter (10), owner, VK hash
  const valueNotEqual = await ValueNotEqualContract.deploy(
    wallet,
    10, // Initial counter value
    accounts[0].item, // Owner address
    data.vkHash as unknown as FieldLike, // VK hash for verification
  ).send({
    from: accounts[0].item,
    fee: { paymentMethod: sponsoredPaymentMethod },
  });

  console.log(`Contract deployed at: ${valueNotEqual.address}`);

  const opts = {
    from: accounts[0].item,
    fee: { paymentMethod: sponsoredPaymentMethod },
  };

  // Step 3: Read initial counter value
  // simulate() executes without submitting a transaction
  let counterValue = await valueNotEqual.methods
    .get_counter(accounts[0].item)
    .simulate({ from: accounts[0].item });
  console.log(`Counter value: ${counterValue}`); // Should be 10

  // Step 4: Call increment() with proof data
  // This creates a transaction that:
  // 1. Executes the private increment() function (client-side)
  // 2. Generates a ZK proof of correct execution
  // 3. Submits the proof to the network
  // 4. Network verifies the proof
  // 5. Executes enqueued _increment_public()
  const interaction = valueNotEqual.methods.increment(
    accounts[0].item,
    data.vkAsFields as unknown as FieldLike[], // 115 field VK
    data.proofAsFields as unknown as FieldLike[], // 508 field proof
    data.publicInputs as unknown as FieldLike[], // Public inputs
  );

  // Step 5: Send transaction and wait for inclusion
  await interaction.send(opts);

  // Step 6: Read updated counter
  counterValue = await valueNotEqual.methods
    .get_counter(accounts[0].item)
    .simulate({ from: accounts[0].item });
  console.log(`Counter value: ${counterValue}`); // Should be 11

  assert(counterValue === 11n, "Counter should be 11 after verification");
}
// docs:end:main

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
