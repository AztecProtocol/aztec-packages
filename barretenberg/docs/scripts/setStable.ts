/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const GITHUB_PAGES = 1;
const NUMBER_OF_VERSIONS_TO_SHOW = 3;

async function main() {
  const axiosOpts = {
    params: { per_page: 100 },
    headers: {},
  };

  if (process.env.GITHUB_TOKEN)
    axiosOpts.headers = { Authorization: `token ${process.env.GITHUB_TOKEN}` };

  let stables = [];
  console.log("Retrieved versions:");

  for (let i = 0; i < GITHUB_PAGES; i++) {
    const { data } = await axios.get(
      `https://api.github.com/repos/AztecProtocol/aztec-packages/releases?page=${
        i + 1
      }`,
      axiosOpts
    );

    stables.push(
      ...data
        .filter((release) => /^v?\d+\.\d+\.\d+$/.test(release.tag_name))
        .map((release) => release.tag_name)
    );
  }

  stables = stables.slice(0, NUMBER_OF_VERSIONS_TO_SHOW);

  console.log("Filtered down to stables: ", stables);

  // Check if each version has a corresponding folder in versioned_docs
  const versionedDocsPath = path.resolve(__dirname, "../versioned_docs");

  // Make sure versioned_docs directory exists
  if (fs.existsSync(versionedDocsPath)) {
    // Get all directories in versioned_docs
    const existingVersionFolders = fs
      .readdirSync(versionedDocsPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    console.log("Existing version folders:", existingVersionFolders);

    // Filter out versions that don't have a corresponding folder
    const filteredStables = stables.filter((version) => {
      // Format the version to match the folder naming convention (version-X.Y.Z)
      // Remove 'v' prefix if it exists
      const folderName = `version-${version}`;
      return existingVersionFolders.includes(folderName);
    });

    if (filteredStables.length !== stables.length) {
      console.log(
        `Removed ${
          stables.length - filteredStables.length
        } versions that don't have matching folders`
      );
      console.log("Final versions:", filteredStables);
      stables = filteredStables;
    }
  } else {
    console.warn(
      "Warning: versioned_docs directory not found at",
      versionedDocsPath
    );
  }

  // To delete when versioning scheme upgrades from 1.0.0-beta.n to 1.x.y
  fs.writeFileSync(
    path.resolve(__dirname, "../versions.json"),
    JSON.stringify(stables, null, 2)
  );
}

main();
