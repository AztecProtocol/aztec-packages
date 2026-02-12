const { processConditionalBlocks } = require("./conditional_content");

// Valid release types for RELEASE_TYPE environment variable
const VALID_RELEASE_TYPES = [
  "nightly",
  "devnet",
  "testnet",
  "mainnet",
  "ignition",
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
      // For nightly, use nightly tag and strip 'v' prefix
      return nightlyTag.startsWith("v") ? nightlyTag.substring(1) : nightlyTag;
    case "devnet":
      // For devnet, use devnet tag and strip 'v' prefix
      return devnetTag.startsWith("v") ? devnetTag.substring(1) : devnetTag;
    case "testnet":
      // For testnet, use testnet tag and strip 'v' prefix
      return testnetTag.startsWith("v") ? testnetTag.substring(1) : testnetTag;
    case "mainnet":
    case "ignition":
      // For mainnet/ignition, use mainnet tag and strip 'v' prefix
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
    case "ignition":
      return "mainnet";
    default:
      throw new Error(
        `Invalid RELEASE_TYPE: "${releaseType}". Must be one of: ${VALID_RELEASE_TYPES.join(", ")}`,
      );
  }
}

/**
 * Preprocesses markdown content to replace version macros and conditional blocks.
 * @param {string} markdownContent - The markdown content to process
 * @param {string} filePath - Path to the file (for error messages)
 * @returns {Promise<{content: string, isUpdated: boolean}>} - Processed content and update flag
 */
async function preprocessIncludeVersion(markdownContent, filePath = "unknown") {
  const originalContent = markdownContent;

  // Get environment variables
  // NIGHTLY_TAG: version for nightly releases (e.g., "v3.0.0-nightly.20251222")
  // COMMIT_TAG: kept for backwards compatibility with #include_aztec_version
  const nightlyTag =
    process.env.NIGHTLY_TAG || process.env.COMMIT_TAG || "0.0.0-nightly.0";
  const testnetTag = process.env.TESTNET_TAG || "2.1.11";
  const devnetTag = process.env.DEVNET_TAG || "3.0.0-devnet.6-patch.1";
  const mainnetTag = process.env.MAINNET_TAG || "2.1.11";
  const releaseType = process.env.RELEASE_TYPE || "nightly";
  // COMMIT_TAG kept for backwards compatibility
  const commitTag = process.env.COMMIT_TAG || "next";

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

  // New macro for API ref paths
  const apiRefVersion = releaseType === "nightly" ? "nightly"
                      : releaseType === "devnet" ? "devnet"
                      : "next";

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
  markdownContent = markdownContent.replaceAll(`#api_ref_version`, apiRefVersion);

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
