const fs = require("fs");
const path = require("path");
const { processConditionalBlocks } = require("./conditional_content");
const { releaseNameFor, versionLabel } = require("../release_names");
const { lineApiFolders, networkApiFolder } = require("../network_docs");
const { lineOf, readPin } = require("./line");
const { docsCommit } = require("./include_code");

// Load version defaults from config file (source of truth for version→type mapping)
const developerVersionConfig = require(path.join(__dirname, "../../developer_version_config.json"));

// Valid release types for RELEASE_TYPE environment variable
const VALID_RELEASE_TYPES = [
  "nightly",
  "devnet",
  "testnet",
  "mainnet",
];

/**
 * Gets the release version based on the release type.
 * @param {string} releaseType - The current release type
 * @param {string} nightlyTag - The nightly version (NIGHTLY_TAG)
 * @param {string} devnetTag - The devnet version (DEVNET_TAG)
 * @param {string} testnetTag - The testnet version (TESTNET_TAG)
 * @param {string} mainnetTag - The mainnet version (MAINNET_TAG)
 * @returns {string} - The appropriate version string
 */
function getReleaseVersion(
  releaseType,
  nightlyTag,
  devnetTag,
  testnetTag,
  mainnetTag,
) {
  switch (releaseType) {
    case "nightly":
      return nightlyTag.startsWith("v") ? nightlyTag.substring(1) : nightlyTag;
    case "devnet":
      return devnetTag.startsWith("v") ? devnetTag.substring(1) : devnetTag;
    case "testnet":
      return testnetTag.startsWith("v") ? testnetTag.substring(1) : testnetTag;
    case "mainnet":
      return mainnetTag.startsWith("v") ? mainnetTag.substring(1) : mainnetTag;
    default:
      throw new Error(
        `Invalid RELEASE_TYPE: "${releaseType}". Must be one of: ${VALID_RELEASE_TYPES.join(", ")}`,
      );
  }
}

/**
 * Gets the network name based on the release type.
 * @param {string} releaseType - The current release type
 * @returns {string} - The network name for --network flag
 */
function getReleaseNetwork(releaseType) {
  switch (releaseType) {
    case "nightly":
      return "local-network";
    case "devnet":
      return "devnet";
    case "testnet":
      return "testnet";
    case "mainnet":
      return "mainnet";
    default:
      throw new Error(
        `Invalid RELEASE_TYPE: "${releaseType}". Must be one of: ${VALID_RELEASE_TYPES.join(", ")}`,
      );
  }
}

// aztec-packages' own code (l1-contracts, barretenberg) at the release the docs build against:
// the installed l1-artifacts version, which `scripts/aztec_node.mts check` holds equal to the
// pinned aztec-node's BB_VERSION. The Labs version (#include_aztec_version) is not an aztec-packages
// tag, and the same names there sit on unrelated commits.
function foundationVersion() {
  const pkg = path.join(__dirname, "../../node_modules/@aztec-foundation/l1-artifacts/package.json");
  return `v${JSON.parse(fs.readFileSync(pkg, "utf8")).version}`;
}

const lineApiRefVersion = (line) => lineApiFolders(developerVersionConfig, [line.name])[line.name];

function pinnedAztecNodeRef() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "../../aztec-node.json"), "utf8")).ref;
}

/**
 * Preprocesses markdown content to replace version macros and conditional blocks.
 * @param {string} markdownContent - The markdown content to process
 * @param {string} filePath - Path to the file (for error messages, and the line it belongs to)
 * @param {string} [rootDir] - The repository root; without it every page is main's
 * @returns {Promise<{content: string, isUpdated: boolean}>} - Processed content and update flag
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: baselined 2026-11-12: predates the complexity budget
async function preprocessIncludeVersion(markdownContent, filePath = "unknown", rootDir = undefined) {
  const originalContent = markdownContent;
  // A line page names its own pin, whatever a release build sets for main's pages.
  const line = lineOf(filePath, rootDir);
  const linePin = line && readPin(rootDir, line);

  // Get environment variables, falling back to version config file defaults
  // COMMIT_TAG: kept for backwards compatibility with #include_aztec_version
  const stripV = (v) => (v && v.startsWith("v") ? v.substring(1) : v);
  const nightlyTag =
    process.env.NIGHTLY_TAG || process.env.COMMIT_TAG || stripV(developerVersionConfig.nightly) || "0.0.0";
  const devnetTag = process.env.DEVNET_TAG || stripV(developerVersionConfig.devnet) || "0.0.0";
  const testnetTag = process.env.TESTNET_TAG || stripV(developerVersionConfig.testnet) || "0.0.0";
  const mainnetTag = process.env.MAINNET_TAG || stripV(developerVersionConfig.mainnet) || "0.0.0";
  const releaseType = process.env.RELEASE_TYPE || "mainnet";
  // Release cuts set COMMIT_TAG to the Labs tag; any other build names the pinned aztec-node tag,
  // the code the pages quote.
  const commitTag = linePin ? linePin.ref : process.env.COMMIT_TAG || pinnedAztecNodeRef();

  // Validate release type
  if (!VALID_RELEASE_TYPES.includes(releaseType)) {
    throw new Error(
      `Invalid RELEASE_TYPE: "${releaseType}". Must be one of: ${VALID_RELEASE_TYPES.join(", ")}`,
    );
  }

  // Calculate derived values
  const releaseVersion = getReleaseVersion(
    releaseType,
    nightlyTag,
    devnetTag,
    testnetTag,
    mainnetTag,
  );
  const releaseNetwork = getReleaseNetwork(releaseType);

  // The folder the build serves once this release type reads the version being built: a release
  // cut freezes these links into its snapshot before it maps that version. A testnet on mainnet's
  // version has no folder of its own. A release that leaves the developer docs alone (a network-only
  // cut) keeps their versions, so its build links folders it serves.
  const developerVersions = process.env.KEEP_DEVELOPER_VERSIONS === "1"
    ? developerVersionConfig
    : { ...developerVersionConfig, [releaseType]: `v${stripV(releaseVersion)}` };
  const apiRefVersion = networkApiFolder(developerVersions, releaseType)
                      ?? (releaseType === "testnet" || releaseType === "mainnet" ? releaseType : "next");

  // Step 1: Process conditional blocks FIRST (before version substitution)
  // This allows conditionals to contain version macros
  markdownContent = processConditionalBlocks(
    markdownContent,
    releaseType,
    filePath,
  );

  // Step 2: Replace new release-type-aware macros
  markdownContent = markdownContent.replaceAll(`#release_version`, releaseVersion);
  markdownContent = markdownContent.replaceAll(`#release_network`, releaseNetwork);
  // Release line name ("Tierra") and full label ("Tierra (v6.0.0)"); an unnamed
  // line falls back to the version so prose never renders an empty word.
  markdownContent = markdownContent.replaceAll(
    `#release_label`,
    versionLabel(releaseVersion),
  );
  markdownContent = markdownContent.replaceAll(
    `#release_name`,
    releaseNameFor(releaseVersion) || `v${releaseVersion}`,
  );
  // The commit the page's snippet links into this repository name, so hand-written links and clones show the same files.
  if (markdownContent.includes("#docs_commit"))
    markdownContent = markdownContent.replaceAll("#docs_commit", docsCommit(rootDir));
  if (markdownContent.includes("#api_ref_version"))
    markdownContent = markdownContent.replaceAll(`#api_ref_version`, line ? lineApiRefVersion(line) : apiRefVersion);
  if (markdownContent.includes("#include_foundation_version")) {
    const foundation = linePin ? `v${linePin.toolchain.l1Artifacts}` : foundationVersion();
    // The prefixless name first: the other macro is a prefix of it.
    markdownContent = markdownContent.replaceAll("#include_foundation_version_without_prefix", foundation.slice(1));
    markdownContent = markdownContent.replaceAll("#include_foundation_version", foundation);
  }

  // Step 3: Replace existing macros (backwards compatibility)
  // TODO: Phase out #include_aztec_version and #include_version_without_prefix macros.
  // Once all usages are migrated to #release_version, remove these and the COMMIT_TAG handling.
  markdownContent = markdownContent.replaceAll(
    `#include_aztec_version`,
    commitTag,
  );

  markdownContent = markdownContent.replaceAll(
    `#include_version_without_prefix`,
    commitTag.startsWith("v") ? commitTag.substring(1) : "latest",
  );

  markdownContent = markdownContent.replaceAll(
    `#include_testnet_version`,
    testnetTag.startsWith("v") ? testnetTag.substring(1) : testnetTag,
  );

  markdownContent = markdownContent.replaceAll(
    `#include_devnet_version`,
    devnetTag.startsWith("v") ? devnetTag.substring(1) : devnetTag,
  );

  markdownContent = markdownContent.replaceAll(
    `#include_mainnet_version`,
    mainnetTag.startsWith("v") ? mainnetTag.substring(1) : mainnetTag,
  );

  return {
    content: markdownContent,
    isUpdated: originalContent !== markdownContent,
  };
}

module.exports = {
  preprocessIncludeVersion,
  getReleaseVersion,
  getReleaseNetwork,
  VALID_RELEASE_TYPES,
};
