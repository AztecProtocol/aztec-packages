import createDebug from "debug";
import acir from "./assets/acir.b64";
import witness from "./assets/witness.b64";

createDebug.enable("*");
const debug = createDebug("browser-test-app");

async function runTest(
  bytecode: string,
  witness: Uint8Array,
  threads?: number
) {
  const { UltraHonkBackend, BarretenbergVerifier } = await import("@aztec/bb.js");

  debug("starting test...");
  const backend = new UltraHonkBackend(bytecode, { threads });
  const proof = await backend.generateProof(witness);

  debug(`getting the verification key...`);
  const verificationKey = await backend.getVerificationKey();
  debug(`destroying the backend...`);
  await backend.destroy();

  debug(`verifying...`);
  const verifier = new BarretenbergVerifier({ threads });
  const verified = await verifier.verifyUltraHonkProof(proof, verificationKey);
  debug(`verified: ${verified}`);

  await verifier.destroy();

  debug("test complete.");
  return verified;
}

(window as any).runTest = runTest;

function base64ToUint8Array(base64: string) {
  let binaryString = atob(base64);
  let len = binaryString.length;
  let bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// This is the verify_honk_proof test, for triggering via the button click.
// Will likely rot as acir changes.
// Update by extracting from ../acir_tests/verify_honk_proof. Specifically:
//   - The base64 representation of the ACIR is the bytecode section of program.json
//   - The base64 representation of the witness is obtained by encoding witness.gz

document.addEventListener("DOMContentLoaded", function () {
  const button = document.createElement("button");
  button.innerText = "Run Test";
  button.addEventListener("click", () => {
    runTest(acir, base64ToUint8Array(witness));
  });
  document.body.appendChild(button);
});
