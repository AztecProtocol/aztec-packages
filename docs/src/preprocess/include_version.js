async function preprocessIncludeVersion(markdownContent) {
  const originalContent = markdownContent;
  const commitTag = process.env.COMMIT_TAG || "master";

  markdownContent = markdownContent.replaceAll(
    `#include_aztec_version`,
    commitTag
  );

  markdownContent = markdownContent.replaceAll(
    `#include_version_without_prefix`,
    commitTag.startsWith('v') ? commitTag.substring(1) : "latest"
  );

  return {
    content: markdownContent,
    isUpdated: originalContent !== markdownContent,
  };
}

module.exports = { preprocessIncludeVersion };
