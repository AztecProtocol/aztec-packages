import fs from "fs";
const { readFileSync, promises: fsPromises } = fs;
import { spawn } from "child_process";
import { ethers } from "ethers";
import solc from "solc";

// Size excluding number of public inputs
const NUMBER_OF_ELEMENTS_IN_HONK_PROOF = 449;
const NUMBER_OF_ELEMENTS_IN_HONK_ZK_PROOF = 500;

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

const hasZK = getEnvVar("HAS_ZK");

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
        "*": ["evm.bytecode.object", "evm.bytecode.linkReferences", "abi"],
      },
    },
  },
};

const NUMBER_OF_FIELDS_IN_PROOF = hasZK
  ? NUMBER_OF_ELEMENTS_IN_HONK_ZK_PROOF
  : NUMBER_OF_ELEMENTS_IN_HONK_PROOF;

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
const linkReferences = contract.evm.bytecode.linkReferences;
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
 * Deploys a library and returns its address
 * @param {ethers.Signer} signer
 * @param {object} contractObject - Compiled library contract from solc output
 * @param {string} libraryName
 * @returns {string} - Deployed library address (0x-prefixed)
 */
const deployLibrary = async (signer, contractObject, libraryName) => {
    const libraryBytecode = contractObject.evm.bytecode.object;
    const libraryAbi = contractObject.abi;

    console.log(`Deploying ${libraryName} library...`);
    const libraryAddress = await deploy(signer, libraryAbi, libraryBytecode);

    // Wait for the library deployment - for some reason we have an issue with nonces here
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log(`${libraryName} deployed at: ${libraryAddress}`);

    return libraryAddress;
};

/**
 * Links every library referenced in solc's linkReferences into the given bytecode.
 * Uses the byte offsets provided by solc rather than re-hashing library names,
 * so it works for any library the compiler reports.
 *
 * @param {string} bytecode - Hex string (no 0x prefix) of the contract to link
 * @param {object} linkReferences - solc linkReferences: { [sourceFile]: { [libName]: [{start,length},...] } }
 * @param {object} contracts - solc contracts output: { [sourceFile]: { [contractName]: ... } }
 * @param {ethers.Signer} signer
 * @returns {string} - Linked bytecode
 */
const linkLibraries = async (bytecode, linkReferences, contracts, signer) => {
  let linked = bytecode;
  for (const [sourceFile, libs] of Object.entries(linkReferences)) {
    for (const [libraryName, refs] of Object.entries(libs)) {
      const libraryContract = contracts[sourceFile]?.[libraryName];
      if (!libraryContract) {
        throw new Error(`Library ${sourceFile}:${libraryName} referenced but not found in compilation output`);
      }
      const libraryAddress = await deployLibrary(signer, libraryContract, libraryName);
      const addressHex = libraryAddress.replace(/^0x/, '').toLowerCase();

      // start/length from solc are byte offsets into the bytecode; we have a hex string (2 chars per byte).
      for (const { start, length } of refs) {
        const hexStart = start * 2;
        const hexLength = length * 2;
        linked = linked.slice(0, hexStart) + addressHex + linked.slice(hexStart + hexLength);
      }
    }
  }
  return linked;
};

/**
 * Converts binary data to array of field elements (32-byte chunks as hex strings)
 * @param {Buffer} buffer - Binary data
 * @return {Array<String>} Array of hex strings with 0x prefix
 */
const binaryToFields = (buffer) => {
  const fields = [];
  for (let i = 0; i < buffer.length; i += 32) {
    const chunk = buffer.slice(i, i + 32);
    fields.push('0x' + chunk.toString('hex'));
  }
  return fields;
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

try {
  const proofPath = getEnvVar("PROOF");

  let proofStr = "";

  const proof = readFileSync(proofPath);
  proofStr = proof.toString("hex");

  let publicInputsPath = getEnvVar("PUBLIC_INPUTS");
  var publicInputs = [];
  let numExtraPublicInputs = 0;
  let extraPublicInputs = [];

  // For flows that use binary proof format, extract public inputs from the proof
  const proofAsFields = binaryToFields(proof);
  if (proofAsFields.length > NUMBER_OF_FIELDS_IN_PROOF) {
    // We need to extract the public inputs from the proof. This might be empty, or just the pairing point object, or be the entire public inputs...
    [numExtraPublicInputs, extraPublicInputs] = readPublicInputs(proofAsFields);
  }

  // Read public inputs from binary file
  const publicInputsBinary = readFileSync(publicInputsPath);
  const innerPublicInputs = binaryToFields(publicInputsBinary);
  publicInputs = innerPublicInputs.concat(extraPublicInputs);

  proofStr = proofStr.substring(64 * numExtraPublicInputs);
  proofStr = "0x" + proofStr;

  const key =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const provider = await getProvider(randomPort);
  const signer = new ethers.Wallet(key, provider);

  const finalBytecode = await linkLibraries(bytecode, linkReferences, output.contracts, signer);

  const address = await deploy(signer, abi, finalBytecode);
  const contract = new ethers.Contract(address, abi, signer);

  const result = await contract.test(proofStr, publicInputs);
  if (!result) throw new Error("Test failed");
} catch (e) {
  console.error(testName, "failed");
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
  }
  throw e;
} finally {
  // Kill anvil at the end of running
  killAnvil();
}
