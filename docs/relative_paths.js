const fs = require("fs");
const path = require("path");

function rewrite(markdownContent, file) {
  const matchAbsolute = new RegExp(
    /(\(\/([a-zA-Z0-9_-]+))(\/[a-zA-Z0-9_-]+)*/g
  );

  const matchSplit = new RegExp(/\/([a-zA-Z0-9_-]+)*/g);

  const tests = markdownContent.split("\n");
  //   console.log(tests);
  //   console.log("TESTING FILE: ", file);
  for (let test of tests) {
    const absolutePathMatches = test.match(matchAbsolute);
    if (!absolutePathMatches) continue;
    // console.log(absolutePathMatches);

    const matches = absolutePathMatches.map((match) => {
      return match.match(matchSplit);
    });

    console.log(matches);
    matches.forEach((s) => {
      if (!s.includes("/img")) {
        // console.log(s);

        let result = s.slice(-1)[0].slice(1);
        // console.log(result);
        s.slice(1).forEach((sub) => {
          result = "../" + result;
        });
        console.log(`(${result}`);
      }
    });
  }
}

const rootDir = path.join(__dirname);
const docsDir = path.join(rootDir, "docs");

async function iterate(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      iterate(filepath);
    } else if (
      stat.isFile() &&
      (file.endsWith(".md") || file.endsWith(".mdx") || file.endsWith(".json"))
    ) {
      //   console.log(file);
      //   if (file === "index.mdx") {
      const markdownContent = fs.readFileSync(filepath, "utf-8");
      //   console.log(markdownContent);
      rewrite(markdownContent, file);
      //   }
    }
  }
}

iterate(docsDir);
