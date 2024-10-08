import axios from "axios";
import logSymbols from "log-symbols";
import { Ora } from "ora";

async function getNamedVersions(githubToken?: string) {
  const fetchOpts = {
    // eslint-disable-next-line camelcase
    params: { per_page: 100 },
    headers: {},
  };

  if (githubToken)
    fetchOpts.headers = { Authorization: `token ${githubToken}` };

  const { data } = await axios.get(
    `https://api.github.com/repos/noir-lang/noir/releases`,
    fetchOpts
  );

  const stable = data.filter(
    (release: any) =>
      !release.tag_name.includes("aztec") &&
      !release.tag_name.includes("nightly") &&
      !release.prerelease
  )[0].tag_name;
  const nightly = data.filter((release: any) =>
    release.tag_name.startsWith("nightly")
  )[0].tag_name;

  return {
    stable,
    nightly,
  };
}

export async function getBbVersionForNoir(
  noirVersion: string,
  spinner: Ora,
  githubToken?: string
) {
  let url = "";

  if (noirVersion === "stable" || noirVersion === "nightly") {
    spinner.start(`Resolving noir version ${noirVersion}...`);
    const resolvedVersions = await getNamedVersions(githubToken);
    spinner.stopAndPersist({
      text: `Resolved noir version ${noirVersion} to ${resolvedVersions[noirVersion]}`,
      symbol: logSymbols.success,
    });
    url = `https://raw.githubusercontent.com/noir-lang/noir/${resolvedVersions[noirVersion]}/scripts/install_bb.sh`;
  } else {
    url = `https://raw.githubusercontent.com/noir-lang/noir/v${noirVersion}/scripts/install_bb.sh`;
  }

  try {
    const { data } = await axios.get(url);
    const versionMatch = data.match(/VERSION="([\d.]+)"/);
    const version = versionMatch ? versionMatch[1] : null;

    return version;
  } catch (e: any) {
    throw new Error(e.message || e);
  }
}
