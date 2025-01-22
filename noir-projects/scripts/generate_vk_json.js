const path = require("path");
const fs = require("fs/promises");
const child_process = require("child_process");
const crypto = require("crypto");

const clientIvcPatterns = require("../client_ivc_circuits.json");
const rollupHonkPatterns = require("../rollup_honk_circuits.json");

const CircuitType = {
  ClientIVCCircuit: 0,
  RollupHonkCircuit: 1,
  HonkCircuit: 2,
};

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

async function getArtifactHash(artifactPath, circuitType, isRecursive) {
  const bytecodeHash = await getBytecodeHash(artifactPath);
  const barretenbergHash = await getBarretenbergHash();
  return generateArtifactHash(
    barretenbergHash,
    bytecodeHash,
    circuitType,
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

function typeOfCircuit(artifactName) {
  if (
    clientIvcPatterns.some((pattern) => artifactName.match(new RegExp(pattern)))
  ) {
    return CircuitType.ClientIVCCircuit;
  } else if (
    rollupHonkPatterns.some((pattern) =>
      artifactName.match(new RegExp(pattern))
    )
  ) {
    return CircuitType.RollupHonkCircuit;
  } else {
    return CircuitType.HonkCircuit;
  }
}

async function processArtifact(artifactPath, artifactName, outputFolder) {
  const circuitType = typeOfCircuit(artifactName);
  const isRecursive = true;

  const artifactHash = await getArtifactHash(
    artifactPath,
    circuitType,
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
      circuitType,
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
  circuitType,
  isRecursive
) {
  if (circuitType == CircuitType.ClientIVCCircuit) {
    console.log("Generating new client ivc vk for", artifactName);
  } else if (circuitType == CircuitType.RollupHonkCircuit) {
    console.log("Generating new rollup honk vk for", artifactName);
  } else {
    console.log("Generating new honk vk for", artifactName);
  }

  const binaryVkPath = vkBinaryFileNameForArtifactName(
    outputFolder,
    artifactName
  );
  const jsonVkPath = vkJsonFileNameForArtifactName(outputFolder, artifactName);

  if (circuitType == CircuitType.ClientIVCCircuit) {
    write_vk_flow = "write_vk_for_ivc";
    vk_as_fields_flow = "vk_as_fields_mega_honk";
    honk_recursion = 0;
  } else if (circuitType == CircuitType.RollupHonkCircuit) {
    write_vk_flow = "write_vk_ultra_rollup_honk";
    vk_as_fields_flow = "vk_as_fields_ultra_rollup_honk";
    honk_recursion = 2;
  } else {
    write_vk_flow = "write_vk_ultra_honk";
    vk_as_fields_flow = "vk_as_fields_ultra_honk";
    honk_recursion = 1;
  }

  const writeVkCommand = `${BB_BIN_PATH} ${write_vk_flow} -h ${honk_recursion} -b "${artifactPath}" -o "${binaryVkPath}" ${
    isRecursive ? "--recursive" : ""
  }`;

  console.log("WRITE VK CMD: ", writeVkCommand);

  const vkAsFieldsCommand = `${BB_BIN_PATH} ${vk_as_fields_flow} -k "${binaryVkPath}" -o "${jsonVkPath}"`;

  console.log("VK AS FIELDS CMD: ", vkAsFieldsCommand);

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
