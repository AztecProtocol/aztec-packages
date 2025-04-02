async function preprocessIncludeVersion(markdownContent) {
  const originalContent = markdownContent;

  markdownContent = markdownContent.replaceAll(
    `#include_aztec_version`,
    process.env.COMMIT_TAG || "master"
  );

  return {
    content: markdownContent,
    isUpdated: originalContent !== markdownContent,
  };
}

module.exports = { preprocessIncludeVersion };
