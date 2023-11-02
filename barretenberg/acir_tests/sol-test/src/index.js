import fs, { readFileSync } from "fs";
import {spawn} from "child_process";
import {ethers} from "ethers";

import ABI from "./contracts/out/Test.sol/Test.json" assert { type: "json" };
import { gunzipSync } from "zlib";

const readWitnessFile = (path) => {
  const buffer = fs.readFileSync(path);
  return gunzipSync(buffer);
};

const getEnvVar = (envvar) => {
  const varVal = process.env[envvar];
  if (!varVal) {
    throw new Error(`${envvar} not set`);
  }
  return varVal;
}

const launchAnvil = async () => {
  const handle = spawn("anvil");
  // console.log("Anvil Launched");
  handle.on("close", (code) => {
    console.log(`anvil exited with code ${code}`)
  });

  // wait until the anvil instance is ready on port 8545
  await new Promise((resolve) => {
    handle.stdout.on("data", (data) => {
      const str = data.toString();
      if (str.includes("Listening on")) {
        // console.log("Anvil Ready");
        resolve(undefined);
      }
    });
  });

  return handle;
}

const deploy = async (abi, signer) => {
    const factory = new ethers.ContractFactory(abi.abi, abi.bytecode.object, signer);
    // console.log("Deploying Contract...");
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
  // console.log("numPublicInputs: ", numPublicInputs);
  const publicInputs = [];
  for (let i = 0; i < numPublicInputs; i++) {
    publicInputs.push(proofAsFields[i]);
  }
  return publicInputs;
}

// start anvil
async function main() {
  // const anvil = await launchAnvil();
  // const killAnvil = () => {
  //   anvil.kill();
  // }

  try {
    // console.log("getting witness");
    const witnessPath = getEnvVar("WITNESS");
    const witness = readWitnessFile(witnessPath);
    // console.log(witness.toString());

    const proofAsFieldsPath = getEnvVar("PROOF_AS_FIELDS");
    const proofAsFields = readFileSync(proofAsFieldsPath);
    const numPublicInputs = +getEnvVar("NUM_PUBLIC_INPUTS");
    const publicInputs = readPublicInputs(numPublicInputs, JSON.parse(proofAsFields.toString()));

    // console.log("getting proof");
    const proofPath = getEnvVar("PROOF");
    // console.log(proofPath)
    const proof = readFileSync(proofPath);
    
    // Cut the number of public inputs off of the proof string
    const proofStr = `0x${proof.toString("hex").substring(64*numPublicInputs)}`;
    // console.log(proofStr)

    // Get the contract artifact
    const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const provider = new ethers.JsonRpcProvider("http://localhost:8545");
    const signer = new ethers.Wallet(key, provider);

    // deploy 
    const address = await deploy(ABI, signer);
    const contract = new ethers.Contract(address, ABI.abi, signer);

    // Run the test
    console.log(publicInputs)
    const result = await contract.test(proofStr, publicInputs);
    console.log(result);
  }
  catch (e) {
    console.log(e)
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    console.log("FAILED")
    // console.log(e);
    throw e;
  }
  finally {
    // Kill anvil at the end of running
    // killAnvil();
  }
}




// Create a proof for the given ACIR


// Deploy the solidity contract

// Run the test


// Set up the command-line interface
// const acir = readBytecodeFile(bytecodePath);
// const witness = readWitnessFile(witnessPath);
// const threads = Math.min(os.cpus().length, 16);


// // Convert the input data to Uint8Arrays within the browser context
// const acirUint8Array = new Uint8Array(acirData as number[]);
// const witnessUint8Array = new Uint8Array(witnessData as number[]);



main()

