async function preprocessIncludeVersion(markdownContent) {
  const originalContent = markdownContent;
  const commitTag = process.env.COMMIT_TAG || "master";
  const testnetTag = process.env.TESTNET_TAG || "0.87.8";

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

  return {
    content: markdownContent,
    isUpdated: originalContent !== markdownContent,
  };
}

module.exports = { preprocessIncludeVersion };
