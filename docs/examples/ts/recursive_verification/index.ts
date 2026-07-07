// docs:start:run_recursion
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import type { FieldLike } from "@aztec/aztec.js/abi";
import { getSponsoredFPCInstance } from "./scripts/sponsored_fpc.js";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { ValueNotEqualContract } from "./artifacts/ValueNotEqual.js";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { NO_FROM } from "@aztec/aztec.js/account";
import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";
import assert from "node:assert";
import fs from "node:fs";

if (!fs.existsSync("data.json")) {
  console.error(
    "data.json not found. Run 'yarn data' first to generate proof data.",
  );
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync("data.json", "utf-8"));

export const NODE_URL = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";

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
    // The wallet manages accounts and connects to the node
    let wallet = await EmbeddedWallet.create(NODE_URL, { ephemeral: true });

    // Register the sponsored FPC so the wallet knows about it
    await wallet.registerContract(sponsoredFPC, SponsoredFPCContract.artifact);
    return wallet;
  } catch (error) {
    console.error("Failed to setup local network:", error);
    throw error;
  }
};

async function main() {
  // Step 1: Setup wallet and create account
  // Accounts in Aztec are smart contracts (account abstraction)
  const wallet = await setupWallet();
  const manager = await wallet.createSchnorrAccount(
    Fr.random(),
    Fr.random(),
    GrumpkinScalar.random(),
  );

  // Deploy the account contract
  const deployMethod = await manager.getDeployMethod();
  await deployMethod.send({
    from: NO_FROM,
    fee: { paymentMethod: sponsoredPaymentMethod },
  });

  const accounts = await wallet.getAccounts();

  // Step 2: Deploy ValueNotEqual contract
  // Constructor args: initial counter (10), owner, VK hash
  const { contract: valueNotEqual } = await ValueNotEqualContract.deploy(
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
  let counterValue = (
    await valueNotEqual.methods
      .get_counter(accounts[0].item)
      .simulate({ from: accounts[0].item })
  ).result;
  console.log(`Counter value: ${counterValue}`); // Should be 10

  // Step 4: Call increment() with proof data
  // This creates a transaction that:
  // 1. Executes the private increment() function (client-side)
  // 2. Generates a ZK proof of correct execution
  // 3. Submits the proof to the network
  // 4. Network verifies the proof
  // 5. Executes enqueued _increment_public()
  const interaction = await valueNotEqual.methods.increment(
    accounts[0].item,
    data.vkAsFields as unknown as FieldLike[], // 115 field VK
    data.proofAsFields as unknown as FieldLike[], // 508 field proof
    data.publicInputs as unknown as FieldLike[], // Public inputs
  );

  // Step 5: Send transaction and wait for inclusion
  await interaction.send(opts);

  // Step 6: Read updated counter
  counterValue = (
    await valueNotEqual.methods
      .get_counter(accounts[0].item)
      .simulate({ from: accounts[0].item })
  ).result;
  console.log(`Counter value: ${counterValue}`); // Should be 11

  assert(counterValue === 11n, "Counter should be 11 after verification");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
// docs:end:run_recursion
