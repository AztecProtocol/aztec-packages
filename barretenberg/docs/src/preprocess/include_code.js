const fs = require("fs");
const path = require("path");

const getLineNumberFromIndex = (fileContent, index) => {
  return fileContent.substring(0, index).split("\n").length;
};

/**
 * Process highlighting directives in code snippets
 */
function processHighlighting(codeSnippet, identifier) {
  const lines = codeSnippet.split("\n");
  const regex1 = /highlight-next-line:([a-zA-Z0-9-._:]+)/;
  const replacement1 = "highlight-next-line";
  const regex2 = /highlight-start:([a-zA-Z0-9-._:]+)/;
  const replacement2 = "highlight-start";
  const regex3 = /highlight-end:([a-zA-Z0-9-._:]+)/;
  const replacement3 = "highlight-end";
  const regex4 = /this-will-error:([a-zA-Z0-9-._:]+)/;
  const replacement4 = "this-will-error";

  let mutated = false;

  const processLine = (line, regex, replacement) => {
    const match = line.match(regex);
    if (match) {
      mutated = true;
      const identifiers = match[1].split(":");
      if (identifiers.includes(identifier)) {
        line = line.replace(match[0], replacement);
      } else {
        line = line.replace(match[0], "");
      }
    }
    return line.trim() == "//" || line.trim() == "#" ? "" : line;
  };

  const countLeadingSpaces = (line) => {
    const match = line.match(/^ */);
    return match ? match[0].length : 0;
  };
  
  let indention = 200;
  let resultLines = [];

  for (let line of lines) {
    mutated = false;
    line = processLine(line, regex1, replacement1);
    line = processLine(line, regex2, replacement2);
    line = processLine(line, regex3, replacement3);
    line = processLine(line, regex4, replacement4);

    if (!(line === "" && mutated)) {
      resultLines.push(line);
      const leadingSpaces = countLeadingSpaces(line);
      if (line.length > 0 && leadingSpaces < indention) {
        indention = leadingSpaces;
      }
    }
  }

  let result = "";
  for (let line of resultLines) {
    result +=
      (line.length > indention ? line.substring(indention) : line).trimEnd() +
      "\n";
  }
  return result.trimEnd();
}

/**
 * Extract code snippet between docs:start and docs:end markers
 */
function extractCodeSnippet(filePath, identifier) {
  let fileContent = fs.readFileSync(filePath, "utf-8");
  let linesToRemove = [];

  const startRegex = /(?:\/\/|#)\s+docs:start:([a-zA-Z0-9-._:]+)/g;
  const endRegex = /(?:\/\/|#)\s+docs:end:([a-zA-Z0-9-._:]+)/g;

  const lookForMatch = (regex) => {
    let match;
    let matchFound = false;
    let matchedLineNum = null;
    let actualMatch = null;
    let lines = fileContent.split("\n");
    
    while ((match = regex.exec(fileContent))) {
      if (match !== null) {
        const identifiers = match[1].split(":");
        let tempMatch = identifiers.includes(identifier) ? match : null;

        if (tempMatch === null) {
          for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.trim() == match[0].trim()) {
              linesToRemove.push(i + 1);
            }
          }
        } else {
          if (matchFound === true) {
            throw new Error(
              `Duplicate for regex ${regex} and identifier ${identifier}`
            );
          }
          matchFound = true;
          matchedLineNum = getLineNumberFromIndex(fileContent, tempMatch.index);
          actualMatch = tempMatch;
        }
      }
    }
    return [actualMatch, matchedLineNum];
  };

  let [startMatch, startLineNum] = lookForMatch(startRegex);
  let [endMatch, endLineNum] = lookForMatch(endRegex);

  if (startMatch !== null) {
    const startIdentifiers = startMatch[1].split(":");
    startMatch = startIdentifiers.includes(identifier) ? startMatch : null;
  }
  if (endMatch !== null) {
    const endIdentifiers = endMatch[1].split(":");
    endMatch = endIdentifiers.includes(identifier) ? endMatch : null;
  }

  if (startMatch === null || endMatch === null) {
    if (startMatch === null && endMatch === null) {
      throw new Error(
        `Identifier "${identifier}" not found in file "${filePath}"`
      );
    } else if (startMatch === null) {
      throw new Error(
        `Start line "docs:start:${identifier}" not found in file "${filePath}"`
      );
    } else {
      throw new Error(
        `End line "docs:end:${identifier}" not found in file "${filePath}"`
      );
    }
  }

  let lines = fileContent.split("\n");

  linesToRemove = linesToRemove.filter((lineNum) => {
    const removal_in_bounds = lineNum >= startLineNum && lineNum <= endLineNum;
    return removal_in_bounds;
  });

  lines = lines.filter((l, i) => {
    return !linesToRemove.includes(i + 1);
  });

  lines = lines.filter((l, i) => {
    return i + 1 > startLineNum && i + 1 < endLineNum - linesToRemove.length;
  });

  let codeSnippet = lines.join("\n");
  codeSnippet = processHighlighting(codeSnippet, identifier);

  return [codeSnippet, startLineNum, endLineNum];
}

/**
 * Preprocess markdown content to replace #include_code directives
 * Format: #include_code snippet_identifier /path/to/file.cpp cpp [options]
 */
const regex =
  /^(?!<!--.*)(?=.*#include_code\s+(\S+)\s+(\S+)\s+(\S+)(?:[ ]+(\S+))?).*$/gm;

async function preprocessIncludeCode(markdownContent, filePath, rootDir) {
  let updatedContent = markdownContent;
  let matchesFound = false;
  let match;
  
  while ((match = regex.exec(markdownContent))) {
    matchesFound = true;
    const fullMatch = match[0];
    const identifier = match[1];
    let codeFilePath = match[2];
    const language = match[3];
    const opts = match[4] || "";

    if (codeFilePath.slice(0) != "/") {
      codeFilePath = `/${codeFilePath}`;
    }

    const noTitle = opts.includes("noTitle");
    const noLineNumbers = opts.includes("noLineNumbers");
    const noSourceLink = opts.includes("noSourceLink");

    try {
      const absCodeFilePath = path.join(rootDir, codeFilePath);
      const [codeSnippet, startLine, endLine] = extractCodeSnippet(
        absCodeFilePath,
        identifier,
        filePath
      );

      const relativeCodeFilePath = path
        .resolve(rootDir, codeFilePath)
        .replace(/^\//, "");
      const urlText = `${relativeCodeFilePath}#L${startLine}-L${endLine}`;
      const tag = process.env.COMMIT_TAG
        ? `${process.env.COMMIT_TAG}`
        : "master";
      const url = `https://github.com/AztecProtocol/aztec-packages/blob/${tag}/barretenberg/${urlText}`;

      const replacement =
        language === "raw"
          ? codeSnippet
          : `\`\`\`${language}\n${codeSnippet}\n\`\`\`\n`;

      updatedContent = updatedContent.replace(fullMatch, replacement);
    } catch (error) {
      const lineNum = getLineNumberFromIndex(markdownContent, match.index);
      throw new Error(
        `Error processing "${filePath}:${lineNum}": ${error.message}.`
      );
    }
  }

  return { content: updatedContent, isUpdated: matchesFound };
}

module.exports = {
  preprocessIncludeCode,
  extractCodeSnippet,
  processHighlighting
};