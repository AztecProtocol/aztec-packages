const fs = require("fs");
const path = require("path");

function rewrite(markdown, fp) {
  const absolutePaths = markdown.match(
    /]\(\/([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+/g
  );
  if (!absolutePaths) return;

  // this is the dissection of path of the file we're looking at
  const filePath = fp.slice(0, -3).split("/").slice(1);
  console.log("------");
  console.log("FILE: ", filePath.join("/"));

  // we're going through each link in there
  for (let l of absolutePaths) {
    const originalLink = l.split("/").slice(1);
    const link = l.split("/").slice(1);
    console.log("Link: ", originalLink.join("/"));

    for (let i = 0; i < filePath.length; i++) {
      if (filePath[i] === originalLink[i]) {
        link.shift();
      } else {
        link.unshift("..");
      }
    }

    console.log("Transformed link:", link.join("/"));
    // markdown = markdown.replace(l, `](${link.join("/")}`);
    // console.log(markdown);
  }
  console.log("\n");
}

async function iterate(dir) {
  const files = fs.readdirSync(dir);
  const contentUpdates = [];

  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      contentUpdates.push(iterate(filepath));
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
