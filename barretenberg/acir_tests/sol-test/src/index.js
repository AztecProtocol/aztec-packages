import fs from "fs";
const {readFileSync, promises: fsPromises} = fs;
import {spawn} from "child_process";
import {ethers} from "ethers";
import solc from "solc";

// We use the solcjs compiler version in this test, although it is slower than foundry, to run the test end to end
// it simplifies of parallelising the test suite

// What does this file do?
//
// 1. Launch an instance of anvil { on a random port, for parallelism }
// 2. Compile the solidity files using solcjs
// 3. Deploy the contract
// 4. Read the previously created proof, and append public inputs
// 5. Run the test against the deployed contract
// 6. Kill the anvil instance

const getEnvVar = (envvar) => {
  const varVal = process.env[envvar];
  if (!varVal) {
    throw new Error(`${envvar} not set`);
  }
  return varVal;
}

// Test name is passed into environment from `flows/sol.sh`
const testName = getEnvVar("TEST_NAME");

// Get solidity files, passed into environment from `flows/sol.sh`
const keyPath = getEnvVar("KEY_PATH");
const verifierPath = getEnvVar("VERIFIER_PATH");
const testPath = getEnvVar("TEST_PATH");
const encoding = {encoding: "utf8"};
const [key, test, verifier] = await Promise.all(
  [
    fsPromises.readFile(keyPath, encoding),
    fsPromises.readFile(testPath, encoding),
    fsPromises.readFile(verifierPath, encoding)
  ]);


var input = {
  language: 'Solidity',
  sources: {
    'Key.sol': {
      content: key
    },
    'Test.sol': {
      content: test
    },
    'Verifier.sol': {
      content: verifier
    }
  },
  settings: { // we require the optimiser
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      '*': {
        '*': ['evm.bytecode.object', 'abi']
      }
    }
  }
};

var output = JSON.parse(solc.compile(JSON.stringify(input)));
const contract = output.contracts['Test.sol']['Test'];
const bytecode = contract.evm.bytecode.object;
const abi = contract.abi;

const launchAnvil = async (port) => {
  const handle = spawn("anvil", ["-p", port]);

  // wait until the anvil instance is ready on port 8545
  await new Promise((resolve) => {
    handle.stdout.on("data", (data) => {
      const str = data.toString();
      if (str.includes("Listening on")) {
        resolve(undefined);
      }
    });
  });

  return handle;
}

const deploy = async (signer) => {
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const deployment = await factory.deploy();
    const deployed = await deployment.waitForDeployment();
    return await deployed.getAddress();
}

/**
 * 
 * @param {number} numPublicInputs 
 * @param {Array<String>} proofAsFields 
 * @returns {Array<String>}
 */
const readPublicInputs = (numPublicInputs, proofAsFields) => {
  const publicInputs = [];
  for (let i = 0; i < numPublicInputs; i++) {
    publicInputs.push(proofAsFields[i]);
  }
  return publicInputs;
}

// start anvil
const randomPort = Math.floor(Math.random() * 10000) + 10000;
const anvil = await launchAnvil(randomPort);
const killAnvil = () => {
  anvil.kill();
  console.log(testName, " complete")
}

try {
  const proofAsFieldsPath = getEnvVar("PROOF_AS_FIELDS");
  const proofAsFields = readFileSync(proofAsFieldsPath);
  const numPublicInputs = +getEnvVar("NUM_PUBLIC_INPUTS");
  const publicInputs = readPublicInputs(numPublicInputs, JSON.parse(proofAsFields.toString()));

  const proofPath = getEnvVar("PROOF");
  const proof = readFileSync(proofPath);
  
  // Cut the number of public inputs off of the proof string
  const proofStr = `0x${proof.toString("hex").substring(64*numPublicInputs)}`;

  // Get the contract artifact
  const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const provider = new ethers.JsonRpcProvider(`http://localhost:${randomPort}`);
  const signer = new ethers.Wallet(key, provider);

  // deploy 
  const address = await deploy(signer);
  const contract = new ethers.Contract(address, abi, signer);

  // Run the test
  const result = await contract.test(proofStr, publicInputs);
  if (!result) throw new Error("Test failed");
}
catch (e) {
  console.error(testName, " failed")
  console.log(e)
  throw e;
}
finally {
  // Kill anvil at the end of running
  killAnvil();
}

