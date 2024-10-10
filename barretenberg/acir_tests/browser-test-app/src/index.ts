import createDebug from "debug";
import { inflate } from "pako";

createDebug.enable("*");
const debug = createDebug("browser-test-app");

async function runTest(
  bytecode: Uint8Array,
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
  const verified = await verifier.verifyUltrahonkProof(proof, verificationKey);
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

// This is the 1_mul test, for triggering via the button click.
// Will likely rot as acir changes.
// Update by extracting from ../acir_tests/1_mul/target/* as needed.
const acir = inflate(
  base64ToUint8Array(
    "H4sIAAAAAAAA/7WR4QrCIBSF53QjooewN9CpTf/1Khs5GmxshDV6+1bdQEb9WXpA7uXCOV4/UfJWPp8d9Gg+GOpTdDFDX2YpzBLPd4TK/hNPvHv9XMEOUtqysFzwihWm1opJVR8011xpdSq0EFZLXZralMxwKSxvlBENBONwOzKfBY7IAi/+JhQLEokFiciCQH5oFlkkFllEFhnkh2aRR2KReyw+SgPvngbkG5oDgSzsvR95DHyRH/0eauWc7UdH3UD7a+fasbvTqXVnOtzspemGKQHgq4ybtcbtWuNLD1+nN3yZBgAA"
  )
);

const witness = inflate(
  base64ToUint8Array(
    "H4sIAAAAAAAC/62Quw0AIBBCPb/r3EUtrnMV4/47qImJ9kID1QtA5io9uR3nP2XCsYoFsES7bHe4XsPDWMoBxKprZQT+NQEPrlbxKAIAAA=="
  )
);

document.addEventListener("DOMContentLoaded", function () {
  const button = document.createElement("button");
  button.innerText = "Run Test";
  button.addEventListener("click", () => runTest(acir, witness));
  document.body.appendChild(button);
});
