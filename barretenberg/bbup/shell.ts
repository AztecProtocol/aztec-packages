import { execSync } from "child_process";
import logSymbols from "log-symbols";
import { Ora } from "ora";
import os from "os";
import axios from "axios";
import fs from "fs";
import { createGunzip } from "zlib";
import tar from "tar-fs";
import { promisify } from "util";

import { pipeline } from "stream";
import path from "path";

import { appendFileSync, existsSync } from "fs";

export function sourceShellConfig() {
  const home = os.homedir();
  const bbBinPath = path.join(home, ".bb");
  const pathEntry = `export PATH="${bbBinPath}:$PATH"\n`;

  if (existsSync(path.join(home, ".bashrc"))) {
    const bashrcPath = path.join(home, ".bashrc");
    appendFileSync(bashrcPath, pathEntry);
  }
  if (existsSync(path.join(home, ".zshrc"))) {
    const zshrcPath = path.join(home, ".zshrc");
    appendFileSync(zshrcPath, pathEntry);
  }
  if (existsSync(path.join(home, ".config", "fish", "config.fish"))) {
    const fishConfigPath = path.join(home, ".config", "fish", "config.fish");
    appendFileSync(fishConfigPath, `set -gx PATH ${bbBinPath} $PATH\n`);
  }

  // Update the current session's PATH
  process.env.PATH = `${bbBinPath}:${process.env.PATH}`;
}

export function exec(cmd: string, options = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    stdio: "pipe",
    ...options,
  });
}
export async function installBB(version: string, spinner: Ora) {
  let architecture = os.arch();
  if (architecture === "arm64") {
    architecture = "aarch64";
  } else if (architecture === "x64") {
    architecture = "x86_64";
  }

  let platform: string = os.platform();
  if (platform === "darwin") {
    platform = "apple-darwin";
  } else if (platform === "linux") {
    platform = "linux-gnu";
  }

  const home = os.homedir();
  const bbPath = path.join(home, ".bb");

  spinner.start(`Installing to ${bbPath}`);
  const tempTarPath = path.join(fs.mkdtempSync("bb-"), "temp.tar.gz");

  if (
    !["x86_64", "aarch64"].includes(architecture) ||
    !["linux-gnu", "apple-darwin"].includes(platform)
  ) {
    throw new Error(
      `Unsupported architecture ${architecture} and platform ${platform}`
    );
  }

  const releaseUrl = `https://github.com/AztecProtocol/aztec-packages/releases/download/aztec-packages-v${version}`;
  const binaryUrl = `${releaseUrl}/barretenberg-${architecture}-${platform}.tar.gz`;

  const response = await axios.get(binaryUrl, { responseType: "stream" });

  const pipelineAsync = promisify(pipeline);
  await pipelineAsync(response.data, fs.createWriteStream(tempTarPath));
  await pipelineAsync(
    fs.createReadStream(tempTarPath),
    createGunzip(),
    tar.extract(bbPath)
  );

  fs.rmSync(path.dirname(tempTarPath), { recursive: true });
  spinner.stopAndPersist({
    text: `Installed barretenberg to ${bbPath}`,
    symbol: logSymbols.success,
  });
  sourceShellConfig();
}
