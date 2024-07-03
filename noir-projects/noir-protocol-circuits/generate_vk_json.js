const path = require("path");
const fs = require("fs/promises");
const child_process = require("child_process");

const bbBin = process.env.BB_BIN || "../../barretenberg/cpp/build/bin/bb";

function vkBinaryFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk`);
}

function vkJsonFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk.json`);
}

function vkDataFileNameForArtifactName(outputFolder, artifactName) {
  return path.join(outputFolder, `${artifactName}.vk.data.json`);
}

async function getArtifactHash(artifactPath) {
  const { hash } = JSON.parse(await fs.readFile(artifactPath));
  return `${hash}`;
}

async function getNewArtifactHash(artifactPath, outputFolder, artifactName) {
  const artifactHash = await getArtifactHash(artifactPath);
  const vkDataPath = vkDataFileNameForArtifactName(outputFolder, artifactName);
  try {
    const { artifactHash: previousArtifactHash } = JSON.parse(
      await fs.readFile(vkDataPath, "utf8")
    );
    if (previousArtifactHash === artifactHash) {
      return null;
    } else {
      console.log(
        `Circuit ${artifactName} has changed, old hash ${previousArtifactHash}, new hash ${artifactHash}`
      );
    }
  } catch (ignored) {
    console.log("No previous vk found for", artifactName);
  }
  return artifactHash;
}

async function processArtifact(artifactPath, outputFolder) {
  const artifactName = path.basename(artifactPath, ".json");

  const artifactHash = await getNewArtifactHash(
    artifactPath,
    outputFolder,
    artifactName
  );
  if (!artifactHash) {
    console.log("Reusing previous vk for", artifactName);
    return;
  }
  console.log("Generating new vk for", artifactName);

  const binaryVkPath = vkBinaryFileNameForArtifactName(
    outputFolder,
    artifactName
  );
  const jsonVkPath = vkJsonFileNameForArtifactName(outputFolder, artifactName);

  const writeVkCommand = `${bbBin} write_vk -b "${artifactPath}" -o "${binaryVkPath}"`;

  const vkAsFieldsCommand = `${bbBin} vk_as_fields -k "${binaryVkPath}" -o "${jsonVkPath}"`;

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

  await fs.writeFile(
    vkDataFileNameForArtifactName(outputFolder, artifactName),
    JSON.stringify(vkData, null, 2)
  );

  console.log("Generated vk for", artifactName);
}

async function main() {
  let [artifactPath, outputFolder] = process.argv.slice(2);
  if (!artifactPath || !outputFolder) {
    console.log(
      "Usage: node generate_vk_json.js <artifactPath> <outputFolder>"
    );
    return;
  }

  processArtifact(artifactPath, outputFolder);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
