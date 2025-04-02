/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const GITHUB_PAGES = 3;

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
      `https://api.github.com/repos/aztecprotocol/aztec-packages/releases?page=${
        i + 1
      }`,
      axiosOpts
    );

    stables.push(
      ...data
        .filter((release) => {
          const tag = release.tag_name;
          return (
            !tag.includes("aztec") &&
            (!tag.includes("-alpha-testnet") || tag.includes("-alpha-testnet"))
          );
        })
        .map((release) => release.tag_name)
    );
  }

  // After collecting all versions, separate and sort them
  const alphaTestnetVersions = stables
    .filter((v) => v.includes("-alpha-testnet"))
    .sort((a, b) => b.localeCompare(a));
  const regularVersions = stables
    .filter((v) => !v.includes("-alpha-testnet"))
    .filter((v) => !v.includes("-nightly"))
    .sort((a, b) => b.localeCompare(a));

  // Take the latest of each
  stables = [regularVersions[0], alphaTestnetVersions[0]].filter(Boolean); // Remove any undefined entries if one type doesn't exist

  console.log("Filtered down to stables: ", stables);

  fs.writeFileSync(
    path.resolve(__dirname, "../versions.json"),
    JSON.stringify(stables, null, 2)
  );
}

main();
