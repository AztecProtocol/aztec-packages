import { parse } from "@iarna/toml";
import axios from "axios";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { describe, test, expect, beforeAll } from "vitest";

const getLatestStable = async () => {
  try {
    const { data } = await axios.get(
      `https://api.github.com/repos/AztecProtocol/aztec-packages/releases`,
    );
    return data[0].tag_name.split("-v")[1];
  } catch (error) {
    console.error("Error fetching latest stable version:", error);
    return;
  }
};

const version = await getLatestStable();
const tag = version.match(/^\d+\.\d+\.\d+$/)
  ? `v${version}`
  : version;

describe("Token contract", () => {
  beforeAll(() => {
    try {
      execSync("npx . new -d -t contract -n token_contract", {
        stdio: "inherit",
      });
    } catch (error) {
      console.error("Error executing command:", error);
    }
  });

  test("Paths were updated correctly", async () => {
    const replaces = [];
    const findAndReplace = async (dir, prefix) => {
      const files = await fs.readdir(dir, {
        withFileTypes: true,
      });
      files.forEach(async (file) => {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          findAndReplace(filePath, prefix); // Recursively search subdirectories
        } else if (file.name === "Nargo.toml") {
          replaces.push(
            new Promise(async (resolve, reject) => {
              let content = parse(await fs.readFile(filePath, "utf8"));
              if (!content.dependencies) return;
              resolve(
                Object.keys(content.dependencies)
                  .filter((dep) => dep.match("@aztec"))
                  .every(
                    (dep) =>
                      content.dependencies[dep] ===
                      JSON.stringify({
                        git: `https://github.com/${AZTEC_REPO}/`,
                        tag,
                        directory: `${prefix}${directory}`,
                      }),
                  ),
              );
            }),
          );
        } else if (file.name === "package.json") {
          replaces.push(
            new Promise(async (resolve, reject) => {
              let content = JSON.parse(await fs.readFile(filePath, "utf8"));
              if (!content.dependencies) return;
              resolve(
                Object.keys(content.dependencies)
                  .filter((deps) => deps.match("@aztec"))
                  // "master" actually means "latest" for the npm release
                  .every(
                    (dep) =>
                      content.dependencies[dep] ===
                      `${version === "master" ? "latest" : `^${version}`}`,
                  ),
              );
            }),
          );
        }
      });
    };

    await findAndReplace(path.resolve("./token_contract"), "");
    const res = await Promise.all(replaces);
    expect(res).toEqual([true, true]);
  });
});
