#!/usr/bin/env node
import { Command } from "commander";
const program = new Command();
import { installBB } from "./shell.js";
import ora from "ora";
import logSymbols from "log-symbols";
import { getBbVersionForNoir } from "./versions.js";
import { execSync } from "child_process";
const spinner = ora({ color: "blue", discardStdin: false });
const bbup = program
    .command("install", { isDefault: true })
    .description("Installs Barretenberg.")
    .option("-f, --frontend", "Match the version of a specific frontend language", "noir");
const options = bbup.opts();
if (options.frontend === "noir") {
    bbup
        .requiredOption("-v, --version <version>", "The Noir version to match", "current")
        .action(async ({ version }) => {
        let resolvedVersion = version;
        if (version === "current") {
            spinner.start(`Querying noir version from nargo`);
            try {
                const output = execSync("nargo --version", { encoding: "utf-8" });
                resolvedVersion = output.match(/nargo version = (\d+\.\d+\.\d+)/)[1];
                spinner.stopAndPersist({
                    text: `Resolved noir version ${resolvedVersion} from nargo`,
                    symbol: logSymbols.success,
                });
            }
            catch (e) {
                spinner.stopAndPersist({
                    text: `Could not get noir version from nargo --version. Please specify a version.`,
                    symbol: logSymbols.error,
                });
                process.exit(1);
            }
        }
        spinner.start(`Getting compatible barretenberg version for noir version ${resolvedVersion}`);
        const compatibleVersion = await getBbVersionForNoir(resolvedVersion, spinner);
        spinner.stopAndPersist({
            text: `Resolved to barretenberg version ${compatibleVersion}`,
            symbol: logSymbols.success,
        });
        spinner.start(`Installing barretenberg`);
        await installBB(compatibleVersion, spinner);
    });
}
bbup.parse();
