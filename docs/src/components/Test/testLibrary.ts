import { test, expect, Locator } from "@playwright/test";
import path from "path";

import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";

const TEST_FOLDER =
  `${process.env.TEST_FOLDER}/_temp_test` ||
  path.resolve("(/usr/test/_temp_test");

test.beforeEach(async () => {
  rmSync(TEST_FOLDER, { recursive: true, force: true });
  mkdirSync(TEST_FOLDER, { recursive: true });
});

export async function execute(locator: Locator) {
  const content = (await locator.innerText()).trim();

  // tells which file are we working on
  const file = await locator.getAttribute("file");

  // tells if we should just compare the conteant with the file
  const compare = await locator.getAttribute("compare");
  if (compare) {
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
    return;
  }

  // tells which lines to replace in the file
  // 0 if all
  // + to append
  // null if none
  // we use the same syntax as Array.slice(), so negative numbers means lines from the end
  const replaceLines = await locator.getAttribute("replaceLines");

  if (replaceLines === null) {
    content.split("\n").map((c) => {
      execFileSync(c.trim(), {
        shell: true,
        cwd: path.join(TEST_FOLDER),
        stdio: "inherit",
        env: { NON_INTERACTIVE: "true", ...process.env },
      });
    });
  } else if (replaceLines === "0") {
    writeFileSync(path.resolve(TEST_FOLDER, file), content + "\n");
  } else if (replaceLines === "+") {
    writeFileSync(path.resolve(TEST_FOLDER, file), content + "\n", {
      flag: "a",
    });
  } else {
    const existingContent = readFileSync(
      path.resolve(TEST_FOLDER, file),
      "utf-8"
    );
    const [begin, end] = replaceLines.split(",").map(Number);
    // we split both the existing content and the new content by lines
    const splitContent = existingContent.split("\n");
    const splitNewContent = content.split("\n");

    // we tell which lines we want to remove
    const removedElements = splitContent.slice(begin, end);

    // we start at begin -1 because lines are 1-indexed
    // and we remove the elements we want to replace
    // replacing by the new content
    const removed = splitContent.splice(
      begin - 1,
      removedElements.length,
      ...splitNewContent
    );

    writeFileSync(
      path.resolve(TEST_FOLDER, file),
      splitContent.join("\n") + "\n"
    );
  }
}
