import createDebug from "debug";
import { ungzip } from "pako";
import { decode } from "@msgpack/msgpack";
import acirs from "./assets/acir.msgpack.b64";
import witnesses from "./assets/witnesses.msgpack.b64";

const readStack = (read: Uint8Array, numToDrop: number): Uint8Array[] => {
  const unpacked = decode(read.subarray(0, read.length - numToDrop)) as Uint8Array[];
  const decompressed = unpacked.map((arr: Uint8Array) => ungzip(arr));
  return decompressed;
};

createDebug.enable("*");
const debug = createDebug("browser-test-app");

async function runTest(
  bytecode: Uint8Array[],
  witness: Uint8Array[],
  threads?: number
) {
  const { AztecClientBackend } = await import("@aztec/bb.js");

  debug("starting test...");
  const backend = new AztecClientBackend(bytecode, { threads });
  const proof = await backend.generateProof(witness);
  debug("generated proof");

  await backend.destroy();

  return false;
  // debug(`verifying...`);
  // const verifier = new BarretenbergVerifier({ threads });
  // const verified = await verifier.verifyUltraHonkProof(proof, verificationKey);
  // debug(`verified: ${verified}`);

  // await verifier.destroy();

  // debug("test complete.");
  // return verified;
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

document.addEventListener("DOMContentLoaded", function () {
  const button = document.createElement("button");
  button.innerText = "Run Test";
  button.addEventListener("click", () =>
    runTest(
      readStack(base64ToUint8Array(acirs), 1),
      readStack(base64ToUint8Array(witnesses), 0)
    )
  );
  document.body.appendChild(button);
});
