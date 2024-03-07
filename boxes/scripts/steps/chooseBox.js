import select from "@inquirer/select";
import {
  getAvailableBoxes,
  getAvailableContracts,
  processProject,
  replacePaths,
  clone,
} from "../utils.js";
import chalk from "chalk";

const { log } = console;

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

  const rootDir = await clone({
    path: "boxes/boxes",
    choice: appType,
    type: "box",
    tag,
    version,
  });

  await replacePaths({
    rootDir,
    tag,
    version,
    prefix: "",
  });
  log(chalk.bgGreen("Your code is ready!"));
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

  const rootDir = await clone({
    path: "noir-projects/noir-contracts/contracts",
    choice: contract,
    type: "contract",
    tag,
    version,
  });

  await replacePaths({
    rootDir,
    tag,
    version,
    prefix: "/noir-projects",
  });

  await processProject({
    rootDir,
    placeholder: "%%contract_name%%",
    contractName: contract,
  });
  log(chalk.bgGreen("Your code is ready!"));

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
