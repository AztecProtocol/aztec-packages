async function preprocessIncludeVersion(markdownContent) {
  const originalContent = markdownContent;
  const commitTag = process.env.COMMIT_TAG || "next";
  const testnetTag = process.env.TESTNET_TAG || "2.0.4";
  const devnetTag = process.env.DEVNET_TAG || "3.0.0-devnet.2";

  markdownContent = markdownContent.replaceAll(
    `#include_aztec_version`,
    commitTag
  );

  markdownContent = markdownContent.replaceAll(
    `#include_version_without_prefix`,
    commitTag.startsWith("v") ? commitTag.substring(1) : "latest"
  );

  markdownContent = markdownContent.replaceAll(
    `#include_testnet_version`,
    testnetTag.startsWith("v") ? testnetTag.substring(1) : testnetTag
  );

  markdownContent = markdownContent.replaceAll(
    `#include_devnet_version`,
    devnetTag.startsWith("v") ? devnetTag.substring(1) : devnetTag
  );

  return {
    content: markdownContent,
    isUpdated: originalContent !== markdownContent,
  };
}

module.exports = { preprocessIncludeVersion };
