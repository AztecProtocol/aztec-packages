const fs = require("fs");
const path = require("path");

function extractCodeSnippet(filePath, identifier) {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  console.log("\nHERE'S THE FILE WE'RE LOOKING UP:", fileContent);

  const startTag = `// docs:start:${identifier}`;
  const endTag = `// docs:end:${identifier}`;
  const startIndex = fileContent.indexOf(startTag);
  const endIndex = fileContent.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `Identifier "${identifier}" not found in file "${filePath}"`
    );
  }

  const slicedContent = fileContent
    .slice(startIndex + startTag.length, endIndex)
    .trim();

  const getLineNumberFromIndex = (fileContent, index) => {
    return fileContent.substr(0, index).split("\n").length;
  };
  const startLine = getLineNumberFromIndex(fileContent, startIndex) + 1;
  const endLine = getLineNumberFromIndex(fileContent, endIndex) - 1;

  console.log("\nHERE'S THE SLICED CONTENT:", slicedContent);

  return [slicedContent, startLine, endLine];
}

async function processMarkdownFilesInDir(rootDir, docsDir, regex) {
  const files = fs.readdirSync(docsDir);
  const contentPromises = [];

  for (const file of files) {
    const filePath = path.join(docsDir, file);
    const stat = fs.statSync(filePath);

    console.log("going into file:", filePath);

    if (stat.isDirectory()) {
      contentPromises.push(processMarkdownFilesInDir(rootDir, filePath, regex));
    } else if (
      stat.isFile() &&
      (file.endsWith(".md") || file.endsWith(".mdx"))
    ) {
      const markdownContent = fs.readFileSync(filePath, "utf-8");

      // Process each include tag in the current markdown file
      let updatedContent = markdownContent;
      let match;
      while ((match = regex.exec(markdownContent))) {
        const fullMatch = match[0];
        const language = match[1];
        const codeFilePath = match[2]; // Relative path to the code file from the root of the Docusaurus project
        const identifier = match[3];

        // const matchStart = match.index;

        try {
          const absoluteCodeFilePath = path.join(rootDir, codeFilePath);

          // Extract the code snippet between the specified comments
          const [codeSnippet, startLine, endLine] = extractCodeSnippet(
            absoluteCodeFilePath,
            identifier
          );

          const url = `https://github.com/AztecProtocol/aztec-packages/blob/master/${path.resolve(
            rootDir,
            codeFilePath
          )}#L${startLine}-L${endLine}`;
          const replacement = `\`\`\`${language} title=${identifier} showLineNumbers \n${codeSnippet}\n\`\`\`\n> [Link to source code.](${url})\n`;

          // Replace the include tag with the code snippet
          updatedContent = updatedContent.replace(fullMatch, replacement);

          // console.log("UPDATED CONTENT", updatedContent);
        } catch (error) {
          console.error(
            `Error processing file "${codeFilePath}":`,
            error.message
          );
        }
      }

      contentPromises.push({ filepath: filePath, content: updatedContent });
    }
  }

  // Wait for all the promises to resolve
  const contentArray = await Promise.all(contentPromises);

  return contentArray;
}

async function writeProcessedFiles(docsDir, destDir, content) {
  let writePromises = [];

  // if (!Array.isArray(content)) throw new Error("NOT AN ARRAY!!!!");

  if (Array.isArray(content)) {
    // It's a dir
    if (content.length > 0) {
      // It's a nonempty dir
      writePromises.push(
        await Promise.all(
          content.map((a) => writeProcessedFiles(docsDir, destDir, a))
        )
      );
    } else {
      console.log("empty dir");
      console.log(content);
    }
  } else if (!content.filepath) {
    // Do nothing
  } else {
    // It's a file
    // Derive the destination path from the original path:
    const relPath = path.relative(docsDir, content.filepath);
    const destFilePath = path.resolve(destDir, relPath);
    const destDirName = path.dirname(destFilePath);
    console.log("I would have pushed to", destFilePath);
    if (!fs.existsSync(destDirName)) {
      fs.mkdirSync(destDirName, { recursive: true });
    }

    writePromises.push(
      fs.promises.writeFile(destFilePath, content.content, {
        encoding: "utf8",
        flag: "w",
      })
    );
  }

  return writePromises;
}

async function run() {
  const rootDir = path.join(__dirname, "../../../");
  const docsDir = path.join(rootDir, "docs", "draft-docs-here");
  const destDir = path.join(rootDir, "docs", "docs");

  console.log(rootDir);
  console.log(docsDir);
  console.log(destDir);

  // E.g. `include_code cpp ../src/my_code.cpp snippet_identifier`
  // `\s+`: one or more whitespace characters (space or tab) after `include_code` command.
  // `(\S+)`: one or more non-whitespaced characters. Captures this as the first argument, which is the language of the code block.
  // etc.
  // `\s*$`: Looks more whitespace at the end of the line (including newline characters). It ensures that there is no other content on the same line after the identifier.
  // `/gm`: match globally (g) across the entire input text and consider multiple lines (m) when matching. This is necessary to handle multiple include tags throughout the markdown content.
  const regex = /include_code\s+(\S+)\s+(\S+)\s+(\S+)\s*$/gm;

  const content = await processMarkdownFilesInDir(rootDir, docsDir, regex);

  console.log("FINAL CONTENT");
  console.dir(content, { depth: 7 });

  await writeProcessedFiles(docsDir, destDir, content);
}

run();
