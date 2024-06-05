const path = require("path");
const fs = require("fs");
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

async function main() {
  fs.mkdirSync(vksPath, { recursive: true });

  const targetFiles = fs.readdirSync(targetPath);
  const artifactNames = targetFiles
    .filter((pathname) => pathname.endsWith(".json"))
    .map((pathname) => path.basename(pathname, ".json"));

  for (const artifactName of artifactNames) {
    const writeVkCommand = `${bbBin} write_vk -b "${path.join(
      targetPath,
      `${artifactName}.json`
    )}" -o "${vkBinaryFileNameForArtifactName(artifactName)}"`;

    const vkAsFieldsCommand = `${bbBin} vk_as_fields -k "${vkBinaryFileNameForArtifactName(
      artifactName
    )}" -o "${vkJsonFileNameForArtifactName(artifactName)}"`;

    await new Promise((resolve, reject) => {
      child_process.exec(`${writeVkCommand} && ${vkAsFieldsCommand}`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  for (const artifactName of artifactNames) {
    const binaryVkPath = vkBinaryFileNameForArtifactName(artifactName);
    const jsonVkPath = vkJsonFileNameForArtifactName(artifactName);
    const binaryVk = fs.readFileSync(binaryVkPath);
    const jsonVk = JSON.parse(fs.readFileSync(jsonVkPath, "utf8"));

    const vkData = {
      keyAsBytes: binaryVk.toString("hex"),
      keyAsFields: jsonVk,
    };

    fs.writeFileSync(
      vkDataFileNameForArtifactName(artifactName),
      JSON.stringify(vkData, null, 2)
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
