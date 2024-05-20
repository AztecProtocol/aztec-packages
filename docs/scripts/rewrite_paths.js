const fs = require("fs");
const path = require("path");

function rewrite(markdown, fp) {
  const absolutePaths = markdown.match(
    /\]\(\/([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+/g
  );
  if (!absolutePaths) return;

  // Get the absolute path of the file
  const filePath = path.resolve(fp);
  const fileDir = path.dirname(filePath);
  const fileDirRelative = path.relative("docs", fileDir);

  console.log("------");
  console.log("FILE: ", fileDirRelative);

  // Go through each link in the markdown file
  for (let l of absolutePaths) {
    const originalLink = l.slice(2); // Remove the initial "]( /"
    const linkPath = path.resolve(path.join("docs", originalLink)); // Resolve to the docs directory

    console.log("Link: ", originalLink);

    // Calculate the relative path from fileDir to linkPath
    const relativePath = path.relative(fileDir, linkPath);

    console.log("Transformed link: ", relativePath);

    // Replace the absolute path with the relative path in the markdown
    markdown = markdown.replace(`(${originalLink}`, `(${relativePath}`);

    // fs.writeFileSync(fp, markdown);
  }
  console.log("\n");
}

async function iterate(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      await iterate(filepath);
    } else if (
      stat.isFile() &&
      (file.endsWith(".md") || file.endsWith(".mdx"))
    ) {
      const markdownContent = fs.readFileSync(filepath, "utf-8");
      rewrite(markdownContent, filepath);
    }
  }
}

iterate("docs/aztec");
