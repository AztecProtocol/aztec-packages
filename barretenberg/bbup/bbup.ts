#!/usr/bin/env node
import { Command, Option } from "commander";
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
  .addOption(
    new Option(
      "-v, --version <version>",
      "The Barretenberg version to install"
    ).implies({ noirVersion: null })
  )
  .addOption(
    new Option(
      "-nv, --noir-version <version>",
      "The Noir version to match"
    ).default("current")
  )
  .action(async ({ version, noirVersion }) => {
    let resolvedBBVersion = "";
    if (noirVersion) {
      let resolvedNoirVersion = noirVersion;
      if (noirVersion === "current") {
        spinner.start(`Querying noir version from nargo`);
        try {
          const output = execSync("nargo --version", { encoding: "utf-8" });
          resolvedNoirVersion = output.match(
            /nargo version = (\d+\.\d+\.\d+)/
          )![1];
          spinner.stopAndPersist({
            text: `Resolved noir version ${resolvedNoirVersion} from nargo`,
            symbol: logSymbols.success,
          });
        } catch (e) {
          spinner.stopAndPersist({
            text: `Could not get noir version from nargo --version. Please specify a version.`,
            symbol: logSymbols.error,
          });
          process.exit(1);
        }
      }

      spinner.start(
        `Getting compatible barretenberg version for noir version ${resolvedNoirVersion}`
      );
      resolvedBBVersion = await getBbVersionForNoir(
        resolvedNoirVersion,
        spinner
      );
      spinner.stopAndPersist({
        text: `Resolved to barretenberg version ${resolvedBBVersion}`,
        symbol: logSymbols.success,
      });
    } else if (version) {
      resolvedBBVersion = version;
    }

    spinner.start(`Installing barretenberg`);

    await installBB(resolvedBBVersion, spinner);
  });

bbup.parse();
