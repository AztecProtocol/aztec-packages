const cache = require("@actions/cache");
const github = require("@actions/github");
const fs = require("fs");

async function main() {
  const successData = `https://github.com/AztecProtocol/aztec-packages/actions/runs/${process.env.RUN_ID}`;
  fs.writeFileSync("success.txt", successData);
  await cache.saveState(["success.txt"], process.env.INPUT_SUCCESS_KEY);
}

main();
