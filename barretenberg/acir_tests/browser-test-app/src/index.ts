import type { ProofData } from "@aztec/bb.js";
import { pino } from "pino";
import { unpack } from "msgpackr";
import { ungzip } from "pako";

const logger = pino({
  name: "browser-test-app",
});

function installUltraHonkGlobals() {
  async function prove(
    bytecode: string,
    witness: Uint8Array,
    threads?: number
  ): Promise<{ proofData: ProofData; verificationKey: Uint8Array }> {
    const { UltraHonkBackend } = await import("@aztec/bb.js");

    logger.debug("starting test...");
    const backend = new UltraHonkBackend(bytecode, { threads });
    const proofData = await backend.generateProof(witness);

    logger.debug(`getting the verification key...`);
    const verificationKey = await backend.getVerificationKey();
    logger.debug(`destroying the backend...`);
    await backend.destroy();
    return { proofData, verificationKey };
  }

  async function verify(proofData: ProofData, verificationKey: Uint8Array) {
    const { BarretenbergVerifier } = await import("@aztec/bb.js");

    logger.debug(`verifying...`);
    const verifier = new BarretenbergVerifier();
    const verified = await verifier.verifyUltraHonkProof(
      proofData,
      verificationKey
    );
    logger.debug(`verified: ${verified}`);

    await verifier.destroy();

    logger.debug("test complete.");
    return verified;
  }

  (window as any).prove = prove;
  (window as any).verify = verify;
}
installUltraHonkGlobals();

function installClientIvcGlobal() {
  interface PrivateExecutionStepRaw {
    functionName: string;
    bytecode: Uint8Array;
    witness: Uint8Array;
    vk: Uint8Array;
  }

  async function processClientIvcInputs(
    ivcInputsBuf: Uint8Array,
  ): Promise<[Uint8Array[], Uint8Array[], Uint8Array[]]> {
    const acirBufs: Uint8Array[] = [];
    const vkBufs: Uint8Array[] = [];
    const witnessBufs: Uint8Array[] = [];
    // Unpack the msgpack data into the format AztecClientBackend expects
    const steps: PrivateExecutionStepRaw[] = unpack(ivcInputsBuf);
    for (const step of steps) {
      acirBufs.push(ungzip(step.bytecode));
      vkBufs.push(step.vk);
      witnessBufs.push(ungzip(step.witness));
    }
    return [acirBufs, witnessBufs, vkBufs];
  }

  async function proveClientIvc(
    ivcInputsBuf: Uint8Array,
    threads?: number,
  ): Promise<{ proof: Uint8Array; verificationKey: Uint8Array }> {
    const { AztecClientBackend } = await import("@aztec/bb.js");

    const [acirBufs, witnessBufs, vkBufs] =
      await processClientIvcInputs(ivcInputsBuf);
    logger.debug("starting test...");
    const backend = new AztecClientBackend(acirBufs, {
      threads,
      logger: console.log,
    });
    const [proof, verificationKey] = await backend.prove(witnessBufs, vkBufs);
    await backend.destroy();
    return { proof, verificationKey };
  }

  (window as any).proveClientIvc = proveClientIvc;
}

installClientIvcGlobal();

document.addEventListener("DOMContentLoaded", function () {
  const ultraHonkButton = document.createElement("button");
  ultraHonkButton.innerText = "Run UltraHonk Proving";
  ultraHonkButton.addEventListener("click", async () => {
    alert("Please select an ACIR bytecode file in the next dialog.");
    const acirFile = await new Promise<File>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.acir";
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    alert("Please select an ACIR witness file in the next dialog.");
    const witnessFile = await new Promise<File>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.witness";
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const acir = await acirFile.text();
    const witness = new Uint8Array(await witnessFile.arrayBuffer());

    const { proofData, verificationKey } = await (window as any).prove(
      acir,
      witness,
    );
    await (window as any).verify(proofData, verificationKey);
  });
  document.body.appendChild(ultraHonkButton);

  const clientIvcButton = document.createElement("button");
  clientIvcButton.innerText = "Run ClientIVC Proving";
  clientIvcButton.addEventListener("click", async () => {
    const ivcInputsFile = await new Promise<File>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.msgpack';
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const ivcInputsBuf = new Uint8Array(await ivcInputsFile.arrayBuffer());
    try {
      await (window as any).proveClientIvc(ivcInputsBuf);
    } catch (error) {
      logger.error("Error during ClientIVC proving:", error);
      return false;
    }
    return true;
  });
  document.body.appendChild(clientIvcButton);
});
