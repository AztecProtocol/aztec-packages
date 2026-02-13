// docs:start:generate_data
import { Noir } from "@aztec/noir-noir_js";
import circuitJson from "../../../../circuits/hello_circuit/target/hello_circuit.json" with { type: "json" };
import { Barretenberg, UltraHonkBackend, deflattenFields } from "@aztec/bb.js";
import fs from "fs";
import { exit } from "process";

// Step 1: Initialize Barretenberg API (the proving system backend)
// Barretenberg is the C++ library that implements UltraHonk
// threads: 1 uses single-threaded mode (increase for faster proofs on multi-core machines)
const barretenbergAPI = await Barretenberg.new({ threads: 1 });

// Step 2: Create Noir circuit instance from compiled bytecode
// This loads the circuit definition so we can execute it
const helloWorld = new Noir(circuitJson as any);

// Step 3: Execute circuit with inputs to generate witness
// The witness is all intermediate values computed during circuit execution
// x=1 (private), y=2 (public) - proves that 1 != 2
const { witness: mainWitness } = await helloWorld.execute({ x: 1, y: 2 });

// Step 4: Create UltraHonk backend with circuit bytecode
// The backend handles proof generation and verification
const mainBackend = new UltraHonkBackend(circuitJson.bytecode, barretenbergAPI);

// Step 5: Generate proof targeting the noir-recursive verifier
// verifierTarget: 'noir-recursive' creates a proof format suitable for
// verification inside another Noir circuit (which is what Aztec contracts are)
const mainProofData = await mainBackend.generateProof(mainWitness, {
  verifierTarget: "noir-recursive",
});

// Step 6: Verify proof locally before saving
// This catches errors early - if verification fails here, it will fail onchain too
const isValid = await mainBackend.verifyProof(mainProofData, {
  verifierTarget: "noir-recursive",
});
console.log(`Proof verification: ${isValid ? "SUCCESS" : "FAILED"}`);

// Step 7: Generate recursive artifacts for onchain use
// This converts the proof and VK into field element arrays that can be
// passed to the Aztec contract
const recursiveArtifacts = await mainBackend.generateRecursiveProofArtifacts(
  mainProofData.proof,
  mainProofData.publicInputs.length,
);

// Step 8: Convert proof to field elements if needed
// Some versions return empty proofAsFields, requiring manual conversion
let proofAsFields = recursiveArtifacts.proofAsFields;
if (proofAsFields.length === 0) {
  console.log("Using deflattenFields to convert proof...");
  proofAsFields = deflattenFields(mainProofData.proof).map((f) => f.toString());
}

const vkAsFields = recursiveArtifacts.vkAsFields;

console.log(`VK size: ${vkAsFields.length}`); // Should be 115
console.log(`Proof size: ${proofAsFields.length}`); // Should be 508
console.log(`Public inputs: ${mainProofData.publicInputs.length}`); // Should be 1

// Step 9: Save all data to JSON for contract interaction
const data = {
  vkAsFields: vkAsFields, // 115 field elements - the verification key
  vkHash: recursiveArtifacts.vkHash, // Hash of VK - stored in contract
  proofAsFields: proofAsFields, // 508 field elements - the proof
  publicInputs: mainProofData.publicInputs.map((p: string) => p.toString()),
};

fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
await barretenbergAPI.destroy();
console.log("Done");
exit();
// docs:end:generate_data
