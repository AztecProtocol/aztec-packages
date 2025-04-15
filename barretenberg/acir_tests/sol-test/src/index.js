import fs from "fs";
const { readFileSync, promises: fsPromises } = fs;
import { spawn } from "child_process";
import { ethers } from "ethers";
import solc from "solc";

// Size excluding number of public inputs
const NUMBER_OF_FIELDS_IN_PLONK_PROOF = 93;
const NUMBER_OF_FIELDS_IN_HONK_PROOF = 456;
const NUMBER_OF_FIELDS_IN_HONK_ZK_PROOF = 507;

const WRONG_PROOF_LENGTH = "0xed74ac0a";
const WRONG_PUBLIC_INPUTS_LENGTH = "0xfa066593";
const SUMCHECK_FAILED = "0x9fc3a218";
const SHPLEMINI_FAILED = "0xa5d82e8a";
const CONSISTENCY_FAILED = "0xa2a2ac83";
const GEMINI_CHALLENGE_IN_SUBGROUP = "0x835eb8f7";

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

const getEnvVarCanBeUndefined = (envvar) => {
  const varVal = process.env[envvar];
  if (!varVal) {
    return false;
  }
  return varVal;
};

const getEnvVar = (envvar) => {
  const varVal = process.env[envvar];
  if (!varVal) {
    throw new Error(`Missing environment variable ${envvar}`);
  }
  return varVal;
};

// Test name is passed into environment from `flows/sol.sh`
const testName = getEnvVar("TEST_NAME");

// Get solidity files, passed into environment from `flows/sol.sh`
const testPath = getEnvVar("TEST_PATH");
const verifierPath = getEnvVar("VERIFIER_PATH");
const encoding = { encoding: "utf8" };
const [test, verifier] = await Promise.all([
  fsPromises.readFile(testPath, encoding),
  fsPromises.readFile(verifierPath, encoding),
]);

// If testing honk is set, then we compile the honk test suite
const testingHonk = getEnvVarCanBeUndefined("TESTING_HONK");
const hasZK = getEnvVarCanBeUndefined("HAS_ZK");

export const compilationInput = {
  language: "Solidity",
  sources: {
    "Test.sol": {
      content: test,
    },
    "Verifier.sol": {
      content: verifier,
    },
  },
  settings: {
    // we require the optimizer
    optimizer: {
      enabled: true,
      runs: 1,
    },
    metadata: {
      appendCBOR: false,
      bytecodeHash: "none",
    },
    outputSelection: {
      "*": {
        "*": ["evm.bytecode.object", "abi"],
      },
    },
  },
};

const NUMBER_OF_FIELDS_IN_PROOF = testingHonk
  ? hasZK
    ? NUMBER_OF_FIELDS_IN_HONK_ZK_PROOF
    : NUMBER_OF_FIELDS_IN_HONK_PROOF
  : NUMBER_OF_FIELDS_IN_PLONK_PROOF;
if (!testingHonk) {
  const keyPath = getEnvVar("KEY_PATH");
  const basePath = getEnvVar("BASE_PATH");
  const [key, base] = await Promise.all([
    fsPromises.readFile(keyPath, encoding),
    fsPromises.readFile(basePath, encoding),
  ]);

  compilationInput.sources["BaseUltraVerifier.sol"] = {
    content: base,
  };
  compilationInput.sources["Key.sol"] = {
    content: key,
  };
}

var output = JSON.parse(solc.compile(JSON.stringify(compilationInput)));

output.errors.forEach((e) => {
  // Stop execution if the contract exceeded the allowed bytecode size
  if (e.errorCode == "5574") throw new Error(JSON.stringify(e));
  // Throw if there are compilation errors
  if (e.severity == "error") {
    throw new Error(JSON.stringify(output.errors, null, 2));
  }
});

const contract = output.contracts["Test.sol"]["Test"];
const bytecode = contract.evm.bytecode.object;
const abi = contract.abi;

/**
 * Launch anvil on the given port,
 * Resolves when ready, rejects when port is already allocated
 * @param {Number} port
 */
const launchAnvil = async (port) => {
  const handle = spawn("anvil", ["-p", port]);

  // wait until the anvil instance is ready on port
  await new Promise((resolve, reject) => {
    // If we get an error reject, which will cause the caller to retry on a new port
    handle.stderr.on("data", (data) => {
      const str = data.toString();
      if (str.includes("error binding")) {
        reject("we go again baby");
      }
    });

    // If we get a success resolve, anvil is ready
    handle.stdout.on("data", (data) => {
      const str = data.toString();
      if (str.includes("Listening on")) {
        resolve(undefined);
      }
    });
  });

  return handle;
};

/**
 * Deploys the contract
 * @param {ethers.Signer} signer
 */
const deploy = async (signer, abi, bytecode) => {
  const factory = new ethers.ContractFactory(abi, bytecode, signer);
  const deployment = await factory.deploy();
  const deployed = await deployment.waitForDeployment();
  return await deployed.getAddress();
};

/**
 * Takes in a proof as fields, and returns the public inputs, as well as the number of public inputs
 * @param {Array<String>} proofAsFields
 * @return {Array} [number, Array<String>]
 */
const readPublicInputs = (proofAsFields) => {
  const publicInputs = [];
  // Compute the number of public inputs, not accounted  for in the constant NUMBER_OF_FIELDS_IN_PROOF
  const numPublicInputs = proofAsFields.length - NUMBER_OF_FIELDS_IN_PROOF;
  for (let i = 0; i < numPublicInputs; i++) {
    publicInputs.push(proofAsFields[i]);
  }
  return [numPublicInputs, publicInputs];
};

/**
 * Get Anvil
 *
 * Creates an anvil instance on a random port, and returns the instance and the port
 * If the port is already allocated, it will try again
 * @returns {[ChildProcess, Number]} [anvil, port]
 */
const getAnvil = async () => {
  const port = Math.floor(Math.random() * 10000) + 10000;
  try {
    return [await launchAnvil(port), port];
  } catch (e) {
    // Recursive call should try again on a new port in the rare case the port is already taken
    // yes this looks dangerous, but it relies on 0-10000 being hard to collide on
    return getAnvil();
  }
};

const getProvider = async (port) => {
  while (true) {
    try {
      const url = `http://127.0.0.1:${port}`;
      return new ethers.JsonRpcProvider(url);
    } catch (e) {
      console.log(e);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

const [anvil, randomPort] = await getAnvil();
const killAnvil = () => {
  anvil.kill();
  console.log(testName, " complete");
};

// TODO(https://github.com/AztecProtocol/barretenberg/issues/1316): Clean this code up. We are trying to use this logic for three different flows: bb plonk, bb honk, and bbjs honk, and all three have different setups.
try {
  const proofPath = getEnvVar("PROOF");

  let proofStr = "";

  const proof = readFileSync(proofPath);
  proofStr = proof.toString("hex");

  let publicInputsAsFieldsPath = getEnvVarCanBeUndefined(
    "PUBLIC_INPUTS_AS_FIELDS"
  ); // PUBLIC_INPUTS_AS_FIELDS is not defined for bb plonk, but is for bb honk and bbjs honk.
  var publicInputs;
  let proofAsFieldsPath = getEnvVarCanBeUndefined("PROOF_AS_FIELDS"); // PROOF_AS_FIELDS is not defined for bbjs, but is for bb plonk and bb honk.
  let numExtraPublicInputs = 0;
  let extraPublicInputs = [];
  if (proofAsFieldsPath) {
    const proofAsFields = readFileSync(proofAsFieldsPath);
    // We need to extract the public inputs from the proof. This might be empty, or just the pairing point object, or be the entire public inputs...
    [numExtraPublicInputs, extraPublicInputs] = readPublicInputs(
      JSON.parse(proofAsFields.toString())
    );
  }
  // We need to do this because plonk doesn't define this path
  if (publicInputsAsFieldsPath) {
    const innerPublicInputs = JSON.parse(
      readFileSync(publicInputsAsFieldsPath).toString()
    ); // assumes JSON array of PI hex strings

    publicInputs = innerPublicInputs.concat(extraPublicInputs);
  } else {
    // for plonk, the extraPublicInputs are all of the public inputs
    publicInputs = extraPublicInputs;
  }
  proofStr = proofStr.substring(64 * numExtraPublicInputs);
  proofStr = "0x" + proofStr;

  const key =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const provider = await getProvider(randomPort);
  const signer = new ethers.Wallet(key, provider);

  const address = await deploy(signer, abi, bytecode);
  const contract = new ethers.Contract(address, abi, signer);

  const result = await contract.test(proofStr, publicInputs);
  if (!result) throw new Error("Test failed");
} catch (e) {
  console.error(testName, "failed");
  if (testingHonk) {
    var errorType = e.data;
    switch (errorType) {
      case WRONG_PROOF_LENGTH:
        throw new Error(
          "Proof length wrong. Possibile culprits: the NUMBER_OF_FIELDS_IN_* constants; number of public inputs; proof surgery; zk/non-zk discrepancy."
        );
      case WRONG_PUBLIC_INPUTS_LENGTH:
        throw new Error("Number of inputs in the proof is wrong");
      case SUMCHECK_FAILED:
        throw new Error("Sumcheck round failed");
      case SHPLEMINI_FAILED:
        throw new Error("PCS round failed");
      case CONSISTENCY_FAILED:
        throw new Error("ZK contract: Subgroup IPA consistency check error");
      case GEMINI_CHALLENGE_IN_SUBGROUP:
        throw new Error("ZK contract: Gemini challenge error");
      default:
        throw e;
    }
  }
  throw e;
} finally {
  // Kill anvil at the end of running
  killAnvil();
}
