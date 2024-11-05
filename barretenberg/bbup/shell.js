import { execSync } from "child_process";
import logSymbols from "log-symbols";
import os from "os";
import axios from "axios";
import fs from "fs";
import { createGunzip } from "zlib";
import tar from "tar-fs";
import { promisify } from "util";
import { pipeline } from "stream";
import path from "path";
export function sourceShellConfig() {
    const shell = execSync("echo $SHELL", { encoding: "utf-8" }).trim();
    if (shell.includes("bash")) {
        process.env.PATH = execSync("echo $PATH", { encoding: "utf-8" }).trim();
    }
    else if (shell.includes("zsh")) {
        process.env.PATH = execSync('zsh -c "echo $PATH"', {
            encoding: "utf-8",
        }).trim();
    }
    else if (shell.includes("fish")) {
        process.env.PATH = execSync('fish -c "echo $PATH"', {
            encoding: "utf-8",
        }).trim();
    }
}
export function exec(cmd, options = {}) {
    return execSync(cmd, {
        encoding: "utf-8",
        stdio: "pipe",
        ...options,
    });
}
export async function installBB(version, spinner) {
    let architecture = os.arch();
    if (architecture === "arm64") {
        architecture = "aarch64";
    }
    else if (architecture === "x64") {
        architecture = "x86_64";
    }
    let platform = os.platform();
    if (platform === "darwin") {
        platform = "apple-darwin";
    }
    else if (platform === "linux") {
        platform = "linux-gnu";
    }
    const home = os.homedir();
    const bbPath = path.join(home, ".bb");
    spinner.start(`Installing to ${bbPath}`);
    const tempTarPath = path.join(fs.mkdtempSync("bb-"), "temp.tar.gz");
    if (!["x86_64", "aarch64"].includes(architecture) ||
        !["linux-gnu", "apple-darwin"].includes(platform)) {
        throw new Error(`Unsupported architecture ${architecture} and platform ${platform}`);
    }
    const releaseUrl = `https://github.com/AztecProtocol/aztec-packages/releases/download/aztec-packages-v${version}`;
    const binaryUrl = `${releaseUrl}/barretenberg-${architecture}-${platform}.tar.gz`;
    const response = await axios.get(binaryUrl, { responseType: "stream" });
    const pipelineAsync = promisify(pipeline);
    await pipelineAsync(response.data, fs.createWriteStream(tempTarPath));
    await pipelineAsync(fs.createReadStream(tempTarPath), createGunzip(), tar.extract(bbPath));
    fs.rmSync(path.dirname(tempTarPath), { recursive: true });
    spinner.stopAndPersist({
        text: `Installed barretenberg to ${bbPath}`,
        symbol: logSymbols.success,
    });
}
