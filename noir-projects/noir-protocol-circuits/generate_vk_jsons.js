const path = require("path");
const fs = require("fs/promises");
const child_process = require("child_process");

const bbBin = process.env.BB_BIN || "../../barretenberg/cpp/build/bin/bb";

const targetPath = path.join(__dirname, "target");
const vksPath = path.join(targetPath, "keys");

function vkBinaryFileNameForArtifactName(artifactName) {
  return path.join(vksPath, `${artifactName}.vk`);
}

function vkJsonFileNameForArtifactName(artifactName) {
  return path.join(vksPath, `${artifactName}.vk.json`);
}

function vkDataFileNameForArtifactName(artifactName) {
  return path.join(vksPath, `${artifactName}.vk.data.json`);
}

async function getArtifactHash(artifactName) {
  const { hash } = JSON.parse(
    await fs.readFile(path.join(targetPath, `${artifactName}.json`))
  );
  return `${hash}`;
}

async function getNewArtifactHash(artifactName) {
  const artifactHash = await getArtifactHash(artifactName);
  const vkDataPath = vkDataFileNameForArtifactName(artifactName);
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

async function processArtifact(artifactName) {
  const artifactHash = await getNewArtifactHash(artifactName);
  if (!artifactHash) {
    console.log("Reusing previous vk for", artifactName);
    return;
  }
  console.log("Generating new vk for", artifactName);

  const binaryVkPath = vkBinaryFileNameForArtifactName(artifactName);
  const jsonVkPath = vkJsonFileNameForArtifactName(artifactName);

  const writeVkCommand = `${bbBin} write_vk -b "${path.join(
    targetPath,
    `${artifactName}.json`
  )}" -o "${binaryVkPath}"`;

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

  const vkData = {
    keyAsBytes: binaryVk.toString("hex"),
    keyAsFields: jsonVk,
    artifactHash,
  };

  await fs.writeFile(
    vkDataFileNameForArtifactName(artifactName),
    JSON.stringify(vkData, null, 2)
  );

  console.log("Generated vk for", artifactName);
}

async function main() {
  await fs.mkdir(vksPath, { recursive: true });

  const targetFiles = await fs.readdir(targetPath);
  const artifactNames = targetFiles
    .filter((pathname) => pathname.endsWith(".json"))
    .map((pathname) => path.basename(pathname, ".json"));

  // await Promise.all(artifactNames.map(processArtifact));

  for (const artifactName of artifactNames) {
    await processArtifact(artifactName);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
