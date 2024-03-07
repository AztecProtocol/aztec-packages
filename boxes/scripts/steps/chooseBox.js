import select from "@inquirer/select";
import input from "@inquirer/input";
import tiged from "tiged";
import {
  getAvailableBoxes,
  replacePaths,
  getAvailableContracts,
} from "../utils.js";
import chalk from "chalk";
import ora from "ora";
const { log } = console;

async function clone({ path, choice, type, tag, version }) {
  const spinner = ora({
    text: `Cloning the ${type} code...`,
    color: "blue",
  });

  try {
    // STEP 1: Clone the contract
    const appName = await input({
      message: `Your ${type} name:`,
      default: `my-aztec-${type}`,
    });

    spinner.start();

    const emitter = tiged(
      // same as the nargo dependencies above:
      // but if the user has set a semver version, we want that tag (i.e. aztec-packages-v0.23.0)
      `AztecProtocol/aztec-packages/${path}/${choice}${tag && `#${tag}`}`,
      {
        verbose: true,
      },
    );

    emitter.on("info", (info) => {
      log(info.message);
    });

    await emitter.clone(`./${appName}`).then(() => {
      replacePaths({
        rootDir: `./${appName}`,
        tag,
        version,
        prefix: type === "contract" ? "/noir-projects" : "",
      });
      log(chalk.bgGreen("Your code is ready!"));
    });
  } catch (error) {
    log(chalk.bgRed(error.message));
    process.exit(1);
  } finally {
    spinner.stop();
  }
}

async function chooseAndCloneBox(tag, version) {
  const availableBoxes = await getAvailableBoxes(tag, version);
  const appType = await select({
    message: `Please choose your Aztec boilerplate:`,
    choices: [
      ...availableBoxes.map((box) => {
        return { value: box.name, name: box.description };
      }),
      { value: "skip", name: "Skip this step" },
    ],
  });

  log(chalk.yellow(`You chose: ${appType}`));

  await clone({
    path: "boxes/boxes",
    choice: appType,
    type: "box",
    tag,
    version,
  });
}

async function chooseAndCloneContract(tag, version) {
  const availableContracts = await getAvailableContracts(tag, version);
  // let user choose one of the contracts in noir-projects
  const contract = await select({
    message: `Please choose your Aztec boilerplate:`,
    choices: [
      ...availableContracts.map((contract) => {
        return { value: contract.name, name: contract.name };
      }),
      { value: "skip", name: "Skip this step" },
    ],
  });

  // clone that specific contract into the user's folder

  log(chalk.yellow(`You chose: ${contract}`));

  await clone({
    path: "noir-projects/noir-contracts/contracts",
    choice: contract,
    type: "contract",
    tag,
    version,
  });

  // get the e2e test for that contract from yarn-project/end-to-end
}

export async function chooseProject(tag, version) {
  const projectType = await select({
    message: `Please choose your type of project:`,
    choices: [
      { value: "fs_app", name: "Boilerplate project with frontend" },
      { value: "contract_only", name: "Just a contract example" },
      { value: "skip", name: "Skip this step" },
    ],
  });

  if (projectType === "skip") {
    return;
  } else if (projectType === "contract_only") {
    await chooseAndCloneContract(tag, version);
  } else if (projectType === "fs_app") {
    await chooseAndCloneBox(tag, version);
  }
}
