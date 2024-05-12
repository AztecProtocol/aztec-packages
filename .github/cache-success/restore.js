const core = require("@actions/core");
const cache = require("@actions/cache");
const fs = require("fs");

async function main() {
    try {
      const cacheKey = await cache.restoreCache(["success.txt"], core.getInput("success-key"));

      if (cacheKey) {
        // Cache was found and restored
        core.exportVariable("cache-success", "true");
        core.info("Cache hit occurred, file restored.");

        // Optionally, read and log the success file content
        const successData = fs.readFileSync("success.txt", "utf8");
        core.info(`NOTE: Skipping due to success from this run: ${successData}`);
      } else {
        // No cache found
        core.exportVariable("cache-success", "false");
        core.info("No cache hit occurred.");
      }
    } catch (error) {
      core.setFailed(`An error occurred while restoring the cache: ${error}`);
    }
}

main();
