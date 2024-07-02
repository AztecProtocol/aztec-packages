import { test, expect, Locator } from "@playwright/test";
import path from "path";

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";

const TEST_FOLDER = process.env.TEST_FOLDER
  ? `${process.env.TEST_FOLDER}/_temp_test`
  : path.resolve(__dirname, "..", "..", "..", "..", "_temp_test");

test.beforeEach(async () => {
  rmSync(TEST_FOLDER, { recursive: true, force: true });
  mkdirSync(TEST_FOLDER, { recursive: true });
});

export async function execute(locator: Locator) {
  const content = (await locator.innerText()).trim();
  const splitNewContent = content.split("\n");

  // the mode
  // exec: execute the content as shell commands
  // compare: compare the content with the expected file
  // all: replace the entire file
  // start: append to the start of the file
  // end: append to the end of the file
  // insert: insert at the index specificed in "at" attribute (negative counts from the end)
  // replace: replace lines between "begin" and "end" attributes
  const mode = await locator.getAttribute("data-mode");
  console.log("mode", mode);

  if (mode === "exec") {
    content.split("\n").map((c) => {
      execFileSync(c.trim(), {
        shell: true,
        cwd: path.join(TEST_FOLDER),
        stdio: "inherit",
        env: { NON_INTERACTIVE: "true", ...process.env },
      });
    });
  } else {
    // tells which file are we working on
    const file = await locator.getAttribute("data-file");

    if (mode === "compare") {
      const trim = (c: string) =>
        c
          .split("\n")
          .map((line) => line.trim().replace(RegExp(/\s*\/\/.+[^\s]|\s+/g), ""))
          .join("");

      const existingContent = readFileSync(
        path.resolve(TEST_FOLDER, file),
        "utf-8"
      );
      expect(trim(content)).toBe(trim(existingContent));
    } else if (mode === "all") {
      writeFileSync(path.resolve(TEST_FOLDER, file), content + "\n", {
        flag: "w",
      });
    } else if (mode === "start") {
      const existingContent = readFileSync(
        path.resolve(TEST_FOLDER, file),
        "utf-8"
      );

      writeFileSync(
        path.resolve(TEST_FOLDER, file),
        content + existingContent + "\n"
      );
    } else if (mode === "end") {
      writeFileSync(path.resolve(TEST_FOLDER, file), content, {
        flag: "a",
      });
    } else if (mode === "insert") {
      const existingContent = readFileSync(
        path.resolve(TEST_FOLDER, file),
        "utf-8"
      );
      const at = await locator.getAttribute("data-at");
      const splitContent = existingContent.split("\n");

      splitContent.splice(Number(at) - 1, 0, ...splitNewContent);
      writeFileSync(path.resolve(TEST_FOLDER, file), splitContent.join("\n"));
    } else if (mode === "replace") {
      const existingContent = readFileSync(
        path.resolve(TEST_FOLDER, file),
        "utf-8"
      );
      // const [begin, end] = replaceLines.split(",").map(Number);
      // we split both the existing content and the new content by lines
      const splitContent = existingContent.split("\n");

      const begin = await locator.getAttribute("data-begin");
      const end = await locator.getAttribute("data-end");

      let removedElements = [];
      // (the Array.slice() syntax applies, i.e. if begin is omitted and end is negative, it will replace from the end of the array)
      if (begin && !end) {
        removedElements = splitContent.slice(Number(begin));
      } else {
        removedElements = splitContent.slice(Number(begin), Number(end));
      }

      splitContent.splice(
        Number(begin) - 1,
        removedElements.length,
        ...splitNewContent
      );

      writeFileSync(path.resolve(TEST_FOLDER, file), splitContent.join("\n"));
    }
  }
}
