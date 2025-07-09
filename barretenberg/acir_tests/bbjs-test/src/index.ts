import fs from "fs/promises";
import path from "path";
import { Command } from "commander";
import assert from "assert";
import { pino } from "pino";

const logger = pino({
  name: "bbjs-test",
});

const UH_PROOF_FIELDS_LENGTH = 507; // length of UltraZKHonk flavor
const BYTES_PER_FIELD = 32;
const UH_PROOF_LENGTH_IN_BYTES = UH_PROOF_FIELDS_LENGTH * BYTES_PER_FIELD;

const proofPath = (dir: string) => path.join(dir, "proof");
const proofAsFieldsPath = (dir: string) => path.join(dir, "proof_fields.json");
const publicInputsAsFieldsPath = (dir: string) =>
  path.join(dir, "public_inputs_fields.json");
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
  const { UltraHonkBackend, deflattenFields } = await import("@aztec/bb.js");

  logger.debug(`Generating proof for ${bytecodePath}...`);
  const circuitArtifact = await fs.readFile(bytecodePath);
  const bytecode = JSON.parse(circuitArtifact.toString()).bytecode;
  const backend = new UltraHonkBackend(bytecode, {
    threads: multiThreaded ? 8 : 1,
  });

  const witness = await fs.readFile(witnessPath);
  const proof = await backend.generateProof(new Uint8Array(witness), {
    keccak: oracleHash === "keccak",
    starknet: oracleHash === "starknet",
  });
  assert(
    proof.proof.length === UH_PROOF_LENGTH_IN_BYTES,
    `Unexpected proof length ${proof.proof.length} for ${bytecodePath}`
  );

  await fs.writeFile(proofPath(outputDirectory), Buffer.from(proof.proof));
  logger.debug("Proof written to " + proofPath(outputDirectory));

  await fs.writeFile(
    publicInputsAsFieldsPath(outputDirectory),
    JSON.stringify(proof.publicInputs)
  );
  logger.debug(
    "Public inputs written to " + publicInputsAsFieldsPath(outputDirectory)
  );

  await fs.writeFile(
    proofAsFieldsPath(outputDirectory),
    JSON.stringify(deflattenFields(proof.proof))
  );

  const verificationKey = await backend.getVerificationKey({
    keccak: oracleHash === "keccak",
    starknet: oracleHash === "starknet",
  });
  await fs.writeFile(vkeyPath(outputDirectory), Buffer.from(verificationKey));
  logger.debug("Verification key written to " + vkeyPath(outputDirectory));

  await backend.destroy();
}

async function verifyProof({ directory }: { directory: string }) {
  const { BarretenbergVerifier } = await import("@aztec/bb.js");

  const verifier = new BarretenbergVerifier();

  const proof = await fs.readFile(proofPath(directory));
  assert(
    proof.length === UH_PROOF_LENGTH_IN_BYTES,
    `Unexpected proof length ${proof.length}, expected ${UH_PROOF_LENGTH_IN_BYTES}`
  );

  const publicInputs = JSON.parse(
    await fs.readFile(publicInputsAsFieldsPath(directory), "utf8")
  );
  logger.debug(`publicInputs: ${JSON.stringify(publicInputs)}`);
  const vkey = await fs.readFile(vkeyPath(directory));

  const verified = await verifier.verifyUltraHonkProof(
    { proof: new Uint8Array(proof), publicInputs },
    new Uint8Array(vkey)
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
