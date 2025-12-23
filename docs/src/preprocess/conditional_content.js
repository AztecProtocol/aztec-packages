/**
 * Conditional Content Processor for Aztec Documentation
 *
 * Processes conditional content blocks in markdown based on RELEASE_TYPE.
 *
 * Syntax:
 *   #if(condition)
 *   content
 *   #elif(condition)
 *   content
 *   #else
 *   content
 *   #endif
 *
 * Supported conditions (matching RELEASE_TYPE values):
 *   - nightly
 *   - devnet
 *   - testnet
 *   - mainnet
 *   - ignition (alias for mainnet)
 */

const VALID_CONDITIONS = ["nightly", "devnet", "testnet", "mainnet", "ignition"];

// Normalize ignition -> mainnet since they're equivalent
const normalize = (type) => (type === "ignition" ? "mainnet" : type);

/**
 * Parses a conditional block into its component parts.
 * @param {string} block - The full conditional block string (from #if to #endif)
 * @param {string} filePath - Path to the file (for error messages)
 * @returns {{ branches: Array<{ condition: string | null, content: string }> }}
 */
function parseConditionalBlock(block, filePath) {
  const branches = [];

  // Match the #if line
  const ifMatch = block.match(/^#if\((\w+)\)\s*\n/);
  if (!ifMatch) {
    throw new Error(
      `Malformed conditional block in "${filePath}": Could not parse #if statement.\nBlock: ${block.substring(0, 100)}...`
    );
  }

  const ifCondition = ifMatch[1];
  if (!VALID_CONDITIONS.includes(ifCondition)) {
    throw new Error(
      `Unknown condition "${ifCondition}" in "${filePath}".\nValid conditions: ${VALID_CONDITIONS.join(", ")}`
    );
  }

  // Remove the #if line and #endif line, then split by #elif and #else
  let remaining = block.substring(ifMatch[0].length);

  // Remove trailing #endif
  const endifIndex = remaining.lastIndexOf("#endif");
  if (endifIndex === -1) {
    throw new Error(
      `Malformed conditional block in "${filePath}": Missing #endif.\nBlock: ${block.substring(0, 100)}...`
    );
  }
  remaining = remaining.substring(0, endifIndex);

  // Split into sections by #elif and #else directives
  const directivePattern = /^#(elif\((\w+)\)|else)\s*\n/gm;
  const sections = [];
  let lastIndex = 0;
  let match;

  while ((match = directivePattern.exec(remaining)) !== null) {
    sections.push({ content: remaining.substring(lastIndex, match.index), directive: null, condition: null });

    if (match[1] === "else") {
      sections.push({ content: null, directive: "else", condition: null });
    } else {
      const elifCondition = match[2];
      if (!VALID_CONDITIONS.includes(elifCondition)) {
        throw new Error(
          `Unknown condition "${elifCondition}" in "${filePath}".\nValid conditions: ${VALID_CONDITIONS.join(", ")}`
        );
      }
      sections.push({ content: null, directive: "elif", condition: elifCondition });
    }

    lastIndex = match.index + match[0].length;
  }

  sections.push({ content: remaining.substring(lastIndex), directive: null, condition: null });

  // Build branches from sections
  let currentCondition = ifCondition;
  let currentContent = "";

  for (const section of sections) {
    if (section.directive === "elif") {
      branches.push({ condition: normalize(currentCondition), content: currentContent });
      currentCondition = section.condition;
      currentContent = "";
    } else if (section.directive === "else") {
      branches.push({ condition: normalize(currentCondition), content: currentContent });
      currentCondition = null; // null means "else" (always true if reached)
      currentContent = "";
    } else if (section.content !== null) {
      currentContent += section.content;
    }
  }

  branches.push({ condition: currentCondition ? normalize(currentCondition) : null, content: currentContent });

  // Check for nested conditionals
  for (const branch of branches) {
    if (branch.content.includes("#if(")) {
      throw new Error(
        `Nested conditional blocks are not supported in "${filePath}".\nFound nested #if inside conditional block`
      );
    }
  }

  return { branches };
}

/**
 * Processes a single conditional block and returns the appropriate content.
 */
function processConditionalBlock(block, releaseType, filePath) {
  const { branches } = parseConditionalBlock(block, filePath);

  for (const branch of branches) {
    // null condition means "else" branch - always matches if we get here
    if (branch.condition === null || branch.condition === releaseType) {
      return branch.content.replace(/^\n/, "").replace(/\n$/, "");
    }
  }

  return "";
}

/**
 * Processes all conditional blocks in markdown content.
 * @param {string} content - The markdown content
 * @param {string} releaseType - The current release type
 * @param {string} filePath - Path to the file (for error messages)
 * @returns {string} - The processed content with conditionals resolved
 */
function processConditionalBlocks(content, releaseType, filePath = "unknown") {
  // Normalize release type (ignition -> mainnet)
  const normalizedReleaseType = normalize(releaseType);

  const blockPattern = /#if\(\w+\)\s*\n[\s\S]*?#endif/g;
  let result = content;
  const matches = [];
  let match;

  while ((match = blockPattern.exec(content)) !== null) {
    matches.push({ fullMatch: match[0], index: match.index });
  }

  // Process in reverse to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, index } = matches[i];
    const replacement = processConditionalBlock(fullMatch, normalizedReleaseType, filePath);
    result = result.substring(0, index) + replacement + result.substring(index + fullMatch.length);
  }

  return result;
}

module.exports = {
  processConditionalBlocks,
  VALID_CONDITIONS,
};
