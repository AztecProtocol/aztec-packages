const fs = require("fs/promises");
const path = require("path");
const {
  BB_BIN_PATH,
  readVKFromS3,
  writeVKToS3,
  generateArtifactHash,
  getBarretenbergHash,
} = require("../../scripts/verification_keys");
const child_process = require("child_process");
const crypto = require("crypto");

function getFunctionArtifactPath(outputFolder, functionName) {
  return path.join(outputFolder, `${functionName}.tmp.json`);
}

function getFunctionVkPath(outputFolder, functionName) {
  return path.join(outputFolder, `${functionName}.vk.tmp.bin`);
}

async function getBytecodeHash({ bytecode }) {
  if (!bytecode) {
    throw new Error("No bytecode found in function artifact");
  }
  return crypto.createHash("md5").update(bytecode).digest("hex");
}

async function generateVkForFunction(functionArtifact, outputFolder) {
  const functionArtifactPath = getFunctionArtifactPath(
    outputFolder,
    functionArtifact.name
  );
  const outputVkPath = getFunctionVkPath(outputFolder, functionArtifact.name);

  await fs.writeFile(
    functionArtifactPath,
    JSON.stringify(functionArtifact, null, 2)
  );

  try {
    const writeVkCommand = `${BB_BIN_PATH} write_vk_for_ivc -b "${functionArtifactPath}" -o "${outputVkPath}" `;

    console.log("WRITE VK CMD: ", writeVkCommand);

    await new Promise((resolve, reject) => {
      child_process.exec(`${writeVkCommand}`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    const binaryVk = await fs.readFile(outputVkPath);
    await fs.unlink(outputVkPath);

    return binaryVk;
  } finally {
    await fs.unlink(functionArtifactPath);
  }
}

async function main() {
  let [artifactPath, tempFolder] = process.argv.slice(2);
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  const barretenbergHash = await getBarretenbergHash();
  for (const functionArtifact of artifact.functions.filter(
    // See contract_artifact.ts (getFunctionType) for reference
    (functionArtifact) =>
      !functionArtifact.custom_attributes.includes("public") &&
      !functionArtifact.is_unconstrained
  )) {
    const artifactName = `${artifact.name}-${functionArtifact.name}`;
    const artifactHash = generateArtifactHash(
      barretenbergHash,
      await getBytecodeHash(functionArtifact),
      true,
      true
    );
    if (
      functionArtifact.verification_key &&
      functionArtifact.artifact_hash === artifactHash
    ) {
      console.log("Reusing on disk VK for", artifactName);
    } else {
      let vk = await readVKFromS3(artifactName, artifactHash, false);
      if (!vk) {
        vk = await generateVkForFunction(functionArtifact, tempFolder);
        await writeVKToS3(artifactName, artifactHash, vk);
      } else {
        console.log("Using VK from remote cache for", artifactName);
      }
      functionArtifact.verification_key = vk.toString("base64");
      functionArtifact.artifact_hash = artifactHash;
    }
  }

  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
