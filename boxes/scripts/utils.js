import path from "path";
import os from "os";
import fs from "fs/promises";
import { parse, stringify } from "@iarna/toml";
import { default as axiosBase } from "axios";
import { CONTRACTS_TO_SHOW } from "./config.js";
import chalk from "chalk";
import ora from "ora";

import input from "@inquirer/input";
import tiged from "tiged";

const { log, warn, info } = console;
const targetDir = path.join(os.homedir(), ".aztec/bin"); // Use os.homedir() to get $HOME

const { GITHUB_TOKEN } = process.env;
const axiosOpts = {};
if (GITHUB_TOKEN) {
  axiosOpts.headers = { Authorization: `token ${GITHUB_TOKEN}` };
}

export const axios = axiosBase.create(axiosOpts);
export const spinner = ora({ color: "blue" });

export async function getAvailableBoxes(tag, version) {
  const { GITHUB_TOKEN } = process.env;
  const axiosOpts = {};
  if (GITHUB_TOKEN) {
    axiosOpts.headers = { Authorization: `token ${GITHUB_TOKEN}` };
  }

  // TODO: Once the downstream zpedro/npx_improvs is merged, this path will change to boxes/boxes
  let data;
  try {
    ({ data } = await axios.get(
      `https://api.github.com/repos/AztecProtocol/aztec-packages/contents/boxes${tag == "master" ? "" : `?ref=${tag}`}`,
      axiosOpts,
    ));
  } catch (e) {
    log(e);
  }

  let availableBoxes = data
    .filter(
      (content) => content.type === "dir" && !content.name.startsWith("."),
    )
    .map(async ({ path, name }) => {
      ({ data } = await axios.get(
        `https://raw.githubusercontent.com/AztecProtocol/aztec-packages/${tag == "master" ? "master" : tag}/${path}/package.json`,
        axiosOpts,
      ));

      return {
        name,
        description: data.description || name,
      };
    });

  return await Promise.all(availableBoxes);
}

export async function getAvailableContracts(tag, version) {
  const { GITHUB_TOKEN } = process.env;
  const axiosOpts = {};
  if (GITHUB_TOKEN) {
    axiosOpts.headers = { Authorization: `token ${GITHUB_TOKEN}` };
  }

  let data;
  try {
    ({ data } = await axios.get(
      `https://api.github.com/repos/AztecProtocol/aztec-packages/contents/noir-projects/noir-contracts/contracts${tag == "master" ? "" : `?ref=${tag}`}`,
      axiosOpts,
    ));
  } catch (e) {
    log(e);
  }

  let availableContracts = data.filter((content) =>
    CONTRACTS_TO_SHOW.includes(content.name),
  );

  return await Promise.all(availableContracts);
}

export async function clone({ path, choice, type, tag, version }) {
  const appName = await input({
    message: `Your ${type} name:`,
    default: `my-aztec-${type}`,
  });

  spinner.text = `Cloning the ${type} code...`;
  try {
    spinner.start();

    const emitter = tiged(
      `AztecProtocol/aztec-packages/${path}/${choice}${tag && `#${tag}`}`,
    );
    emitter.on("info", log);
    await emitter.clone(`./${appName}`);

    if (type === "contract") {
      spinner.text = `Cloning default contract project...`;
      const baseEmitter = tiged(
        `AztecProtocol/aztec-packages/boxes/contract-only${tag && `#${tag}`}`,
      );
      baseEmitter.on("info", log);
      await baseEmitter.clone(`./${appName}/base`);
      await fs.cp(`./${appName}/base`, `./${appName}`, {
        recursive: true,
        force: true,
      });
      await fs.rm(`./${appName}/base`, { recursive: true, force: true });
    }
    return `./${appName}`;
  } catch (error) {
    log(chalk.bgRed(error));
    process.exit(1);
  } finally {
    spinner.stop();
  }
}

export async function processProject({ rootDir, placeholder, contractName }) {
  spinner.text = `Processing the code...`;
  try {
    spinner.start();
    const processes = [];
    const findAndReplace = async (dir, placeholder, contractName) => {
      const files = await fs.readdir(dir, {
        withFileTypes: true,
      });
      files.forEach(async (file) => {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          findAndReplace(filePath, placeholder, contractName);
        } else {
          processes.push(
            new Promise(async (resolve, reject) => {
              const content = await fs.readFile(filePath, "utf8");
              const newContent = content.replace(placeholder, contractName);
              await fs.writeFile(filePath, newContent, "utf8");
              resolve();
            }),
          );
        }
      });
    };

    await findAndReplace(path.resolve(rootDir), placeholder, contractName);
    await Promise.all(processes);
  } catch (error) {
    log(chalk.bgRed(error));
    process.exit(1);
  } finally {
    spinner.stop();
  }
}

export function prettyPrintNargoToml(config) {
  const withoutDependencies = Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== "dependencies"),
  );

  const partialToml = stringify(withoutDependencies);
  const dependenciesToml = Object.entries(config.dependencies).map(
    ([name, dep]) => {
      const depToml = stringify.value(dep);
      return `${name} = ${depToml}`;
    },
  );

  return (
    partialToml + "\n[dependencies]\n" + dependenciesToml.join("\n") + "\n"
  );
}

export async function updatePathEnvVar() {
  // Detect the user's shell profile file based on common shells and environment variables
  const homeDir = os.homedir();
  let shellProfile;
  if (process.env.SHELL?.includes("bash")) {
    shellProfile = path.join(homeDir, ".bashrc");
  } else if (process.env.SHELL?.includes("zsh")) {
    shellProfile = path.join(homeDir, ".zshrc");
  } else {
    // Extend with more conditions for other shells if necessary
    warn("Unsupported shell or shell not detected.");
    return;
  }

  // Read the current content of the shell profile to check if the path is already included
  const profileContent = await fs.readFile(shellProfile, "utf8");
  if (profileContent.includes(targetDir)) {
    log(`${targetDir} is already in PATH.`);
    return;
  }

  // Append the export command to the shell profile file
  const exportCmd = `\nexport PATH="$PATH:${targetDir}" # Added by Node.js script\n`;
  await fs.appendFile(shellProfile, exportCmd);

  info(`Added ${targetDir} to PATH in ${shellProfile}.`);
}

export async function replacePaths({ rootDir, tag, version, prefix = "" }) {
  spinner.text = `Replacing paths...`;

  try {
    spinner.start();
    const replaces = [];
    const findAndReplace = async (dir, tag, version, prefix) => {
      console.log(dir);
      const files = await fs.readdir(dir, {
        withFileTypes: true,
      });
      files.forEach(async (file) => {
        const filePath = path.join(dir, file.name);
        if (file.isDirectory()) {
          findAndReplace(filePath, tag, version, prefix); // Recursively search subdirectories
        } else if (file.name === "Nargo.toml") {
          replaces.push(
            new Promise(async (resolve, reject) => {
              let content = parse(await fs.readFile(filePath, "utf8"));

              Object.keys(content.dependencies).forEach((dep) => {
                const directory = content.dependencies[dep].path.replace(
                  /^(..\/)+/,
                  "",
                );
                content.dependencies[dep] = {
                  git: "https://github.com/AztecProtocol/aztec-packages",
                  tag,
                  directory: `${prefix}/${directory}`,
                };
              });

              await fs.writeFile(
                filePath,
                prettyPrintNargoToml(content),
                "utf8",
              );
              resolve();
            }),
          );
        } else if (file.name === "package.json") {
          replaces.push(
            new Promise(async (resolve, reject) => {
              let content = JSON.parse(await fs.readFile(filePath, "utf8"));
              Object.keys(content.dependencies)
                .filter((deps) => deps.match("@aztec"))
                // "master" actually means "latest" for the npm release
                .map(
                  (dep) =>
                    (content.dependencies[dep] =
                      `${version === "master" ? "latest" : `^${version}`}`),
                );
              await fs.writeFile(filePath, JSON.stringify(content), "utf8");
              resolve();
            }),
          );
        }
      });
    };

    await findAndReplace(path.resolve(rootDir), tag, version, prefix);
    return await Promise.all(replaces);
  } catch (error) {
    log(chalk.bgRed(error));
    process.exit(1);
  } finally {
    spinner.stop();
  }
}
