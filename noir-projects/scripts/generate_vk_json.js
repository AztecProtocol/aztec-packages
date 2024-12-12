const path = require("path");
const fs = require("fs/promises");
const child_process = require("child_process");
const crypto = require("crypto");

const clientIvcPatterns = require("../client_ivc_circuits.json");
const {
  readVKFromS3,
  writeVKToS3,
  getBarretenbergHash,
  generateArtifactHash,
  BB_BIN_PATH,
} = require("./verification_keys");

function vkBinaryFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk`);
}

function vkJsonFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk.json`);
}

function vkDataFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk.data.json`);
}

async function getBytecodeHash(artifactPath) {
  const { bytecode } = JSON.parse(await fs.readFile(artifactPath));
  if (!bytecode) {
    throw new Error("No bytecode found in artifact: " + artifactPath);
  }
  return crypto.createHash("md5").update(bytecode).digest("hex");
}

async function getArtifactHash(artifactPath, isClientIvc, isRecursive) {
  const bytecodeHash = await getBytecodeHash(artifactPath);
  const barretenbergHash = await getBarretenbergHash();
  return generateArtifactHash(
    barretenbergHash,
    bytecodeHash,
    isClientIvc,
    isRecursive
  );
}

async function hasArtifactHashChanged(artifactHash, vkDataPath) {
  try {
    const { artifactHash: previousArtifactHash } = JSON.parse(
      await fs.readFile(vkDataPath, "utf8")
    );
    if (previousArtifactHash === artifactHash) {
      return false;
    } else {
      console.log(
        `Circuit ${artifactName} has changed, old hash ${previousArtifactHash}, new hash ${artifactHash}`
      );
    }
  } catch (ignored) {
    console.log(`No on disk vk found in: ${vkDataPath}`);
  }
  return true;
}

function isClientIvcCircuit(artifactName) {
  return clientIvcPatterns.some((pattern) =>
    artifactName.match(new RegExp(pattern))
  );
}

async function processArtifact(artifactPath, artifactName, outputFolder) {
  const isClientIvc = isClientIvcCircuit(artifactName);
  const isRecursive = true;

  const artifactHash = await getArtifactHash(
    artifactPath,
    isClientIvc,
    isRecursive
  );

  const vkDataPath = vkDataFileNameForArtifactName(outputFolder, artifactName);

  const hasChanged = await hasArtifactHashChanged(artifactHash, vkDataPath);
  if (!hasChanged) {
    console.log(`Reusing on disk vk: ${vkDataPath}`);
    return;
  }

  let vkData = await readVKFromS3(artifactName, artifactHash);
  if (!vkData) {
    vkData = await generateVKData(
      artifactName,
      outputFolder,
      artifactPath,
      artifactHash,
      isClientIvc,
      isRecursive
    );
    await writeVKToS3(artifactName, artifactHash, JSON.stringify(vkData));
  } else {
    console.log("Using VK from remote cache for", artifactName);
  }

  await fs.writeFile(vkDataPath, JSON.stringify(vkData, null, 2));
}

async function generateVKData(
  artifactName,
  outputFolder,
  artifactPath,
  artifactHash,
  isClientIvc,
  isRecursive
) {
  if (isClientIvc) {
    console.log("Generating new client ivc vk for", artifactName);
  } else {
    console.log("Generating new vk for", artifactName);
  }

  const binaryVkPath = vkBinaryFileNameForArtifactName(
    outputFolder,
    artifactName
  );
  const jsonVkPath = vkJsonFileNameForArtifactName(outputFolder, artifactName);

  function getVkCommand() {
    if (isClientIvc) return "write_vk_for_ivc";
    return "write_vk_ultra_honk";
  }

  const writeVkCommand = `${BB_BIN_PATH} ${getVkCommand()} -h -b "${artifactPath}" -o "${binaryVkPath}" ${
    isRecursive ? "--recursive" : ""
  }`;

  console.log("WRITE VK CMD: ", writeVkCommand);

  const vkAsFieldsCommand = `${BB_BIN_PATH} ${
    isClientIvc ? "vk_as_fields_mega_honk" : "vk_as_fields_ultra_honk"
  } -k "${binaryVkPath}" -o "${jsonVkPath}"`;

  await new Promise((resolve, reject) => {
    child_process.exec(`${writeVkCommand} && ${vkAsFieldsCommand}`, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  const binaryVk = await fs.readFile(binaryVkPath);
  const jsonVk = JSON.parse(await fs.readFile(jsonVkPath, "utf8"));
  await fs.unlink(jsonVkPath);
  await fs.unlink(binaryVkPath);

  const vkData = {
    keyAsBytes: binaryVk.toString("hex"),
    keyAsFields: jsonVk,
    artifactHash,
  };
  console.log("Generated vk for", artifactName);

  return vkData;
}

async function main() {
  let [artifactPath, outputFolder] = process.argv.slice(2);
  if (!artifactPath || !outputFolder) {
    console.log(
      "Usage: node generate_vk_json.js <artifactPath> <outputFolder>"
    );
    return;
  }

  await processArtifact(
    artifactPath,
    path.basename(artifactPath, ".json"),
    outputFolder
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
