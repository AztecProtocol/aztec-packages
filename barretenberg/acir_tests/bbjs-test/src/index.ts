import fs from "fs/promises";
import path from "path";
import { Command } from "commander";
import assert from "assert";
import { pino } from "pino";

const logger = pino({
  name: "bbjs-test",
});

const proofPath = (dir: string) => path.join(dir, "proof");
const publicInputsPath = (dir: string) => path.join(dir, "public_inputs");
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

  logger.debug(`Generating proof for ${bytecodePath}...`);
  const circuitArtifact = await fs.readFile(bytecodePath);
  const bytecode = JSON.parse(circuitArtifact.toString()).bytecode;
  const backend = new UltraHonkBackend(bytecode, {
    threads: multiThreaded ? 8 : 1,
  });

  const witness = await fs.readFile(witnessPath);
  const proof = await backend.generateProof(new Uint8Array(witness), {
    keccakZK: oracleHash === "keccakZK",
    starknetZK: oracleHash === "starknetZK",
  });

  await fs.writeFile(proofPath(outputDirectory), Buffer.from(proof.proof));
  logger.debug("Proof written to " + proofPath(outputDirectory));

  // Convert public inputs from field strings to binary
  const publicInputsBuffer = Buffer.concat(
    proof.publicInputs.map((field: string) => {
      const hex = field.startsWith('0x') ? field.slice(2) : field;
      return Buffer.from(hex.padStart(64, '0'), 'hex');
    })
  );
  await fs.writeFile(publicInputsPath(outputDirectory), publicInputsBuffer);
  logger.debug(
    "Public inputs written to " + publicInputsPath(outputDirectory)
  );

  const verificationKey = await backend.getVerificationKey({
    keccakZK: oracleHash === "keccakZK",
    starknetZK: oracleHash === "starknetZK",
  });
  await fs.writeFile(vkeyPath(outputDirectory), Buffer.from(verificationKey));
  logger.debug("Verification key written to " + vkeyPath(outputDirectory));

  await backend.destroy();
}

async function verifyProof({ directory }: { directory: string }) {
  const { UltraHonkVerifierBackend } = await import("@aztec/bb.js");

  const verifier = new UltraHonkVerifierBackend();

  const proof = await fs.readFile(proofPath(directory));

  // Read binary public inputs and convert to field strings
  const publicInputsBinary = await fs.readFile(publicInputsPath(directory));
  const publicInputs = [];
  for (let i = 0; i < publicInputsBinary.length; i += 32) {
    const chunk = publicInputsBinary.slice(i, Math.min(i + 32, publicInputsBinary.length));
    publicInputs.push('0x' + chunk.toString('hex'));
  }
  logger.debug(`publicInputs: ${JSON.stringify(publicInputs)}`);
  const verificationKey = await fs.readFile(vkeyPath(directory));

  const verified = await verifier.verifyProof(
    { proof: new Uint8Array(proof), publicInputs, verificationKey},
  );

  await verifier.destroy();
  logger.debug(`Proof verified: ${verified}`);
  return verified;
}

// Prepare a minimal command line interface
const program = new Command();

program
  .command("prove")
  .option("-b, --bytecode-path <path>", "bytecode path")
  .option("-w, --witness-path <path>", "witness path")
  .option("-o, --output-directory <path>", "output directory")
  .option("-h, --oracle-hash <hash>", "oracle hash")
  .option("--multi-threaded", "multi-threaded")
  .action((args) => generateProof(args));

program
  .command("verify")
  .option("-d, --directory <path>", "directory")
  .action(async (args) => {
    const result = await verifyProof(args);
    process.exit(result ? 0 : 1);
  });

program.parse(process.argv);
