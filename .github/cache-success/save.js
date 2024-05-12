const core = require("@actions/core");
const cache = require("@actions/cache");
const github = require("@actions/github");
const fs = require("fs");

async function main() {
  const successData = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  fs.writeFileSync("success.txt", successData);
  await cache.saveState(["success.txt"], core.getInput("success-key"));
}

main();
