const path = require("path");
const fs = require("fs").promises;

async function main() {
  let [contractArtifactPath, functionName] = process.argv.slice(2);
  if (!contractArtifactPath || !functionName) {
    console.log(
      "Usage: node extractFunctionAsNoirArtifact.js <contractArtifactPath> <functionName>"
    );
    return;
  }

  const contractArtifact = JSON.parse(
    await fs.readFile(contractArtifactPath, "utf8")
  );
  const func = contractArtifact.functions.find((f) => f.name === functionName);
  if (!func) {
    console.error(
      `Function ${functionName} not found in ${contractArtifactPath}`
    );
    return;
  }

  const artifact = {
    noir_version: contractArtifact.noir_version,
    hash: 0,
    abi: func.abi,
    bytecode: func.bytecode,
    debug_symbols: func.debug_symbols,
    file_map: contractArtifact.file_map,
    names: ["main"],
  };

  const outputDir = path.dirname(contractArtifactPath);
  const outputName =
    path.basename(contractArtifactPath, ".json") + `-${functionName}.json`;

  await fs.writeFile(
    path.join(outputDir, outputName),
    JSON.stringify(artifact, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
