import createDebug from "debug";
import fs from "fs/promises";
import path from "path";
import { Command } from "commander";
import assert from "assert";

createDebug.enable("*");
const debug = createDebug("bbjs-test");

const proofPath = (dir: string) => path.join(dir, "proof");
const publicInputsPath = (dir: string) => path.join(dir, "public-inputs");
const vkeyPath = (dir: string) => path.join(dir, "vk");

async function generateProof({
  bytecodePath,
  witnessPath,
  outputDirectory,
  oracleHash,
  multiThreaded,
}: {
  bytecodePath: string;
  witnessPath: string;
  outputDirectory: string;
  oracleHash?: string;
  multiThreaded?: boolean;
}) {
  const { UltraHonkBackend } = await import("@aztec/bb.js");

  debug(`Generating proof for ${bytecodePath}...`);
  const circuitArtifact = await fs.readFile(bytecodePath);
  const bytecode = JSON.parse(circuitArtifact.toString()).bytecode;
  const backend = new UltraHonkBackend(bytecode, { threads: multiThreaded ? 8 : 1 });

  const witness = await fs.readFile(witnessPath);
  const proof = await backend.generateProof(new Uint8Array(witness), { keccak: (oracleHash === "keccak") });

  await fs.writeFile(proofPath(outputDirectory), Buffer.from(proof.proof));
  debug("Proof written to " + proofPath(outputDirectory));

  await fs.writeFile(publicInputsPath(outputDirectory), JSON.stringify(proof.publicInputs));
  debug("Public inputs written to " + publicInputsPath(outputDirectory));

  const verificationKey = await backend.getVerificationKey({ keccak: (oracleHash === "keccak") });
  await fs.writeFile(vkeyPath(outputDirectory), Buffer.from(verificationKey));
  debug("Verification key written to " + vkeyPath(outputDirectory));

  await backend.destroy();
}

async function verifyProof({ directory }: { directory: string }) {
  const { BarretenbergVerifier } = await import("@aztec/bb.js");

  const verifier = new BarretenbergVerifier();

  const proof = await fs.readFile(proofPath(directory));
  const publicInputs = JSON.parse(await fs.readFile(publicInputsPath(directory), "utf8"));
  const vkey = await fs.readFile(vkeyPath(directory));

  const verified = await verifier.verifyUltraHonkProof(
    { proof: new Uint8Array(proof), publicInputs },
    new Uint8Array(vkey)
  );

  await verifier.destroy();
  debug(`Proof verified: ${verified}`);
}

// Prepare a minimal command line interface
const program = new Command();

program
  .command("prove")
  .option("-b, --bytecode-path <path>", "bytecode path")
  .option("-w, --witness-path <path>", "witness path")
  .option("-o, --output-directory <path>", "output directory")
  .option("-h, --oracle-hash <hash>", "oracle hash")
  .option("-multi-threaded", "multi-threaded")
  .action((args) => generateProof(args));

program
  .command("verify")
  .option("-d, --directory <path>", "directory")
  .action((args) => verifyProof(args));

program.parse(process.argv);
