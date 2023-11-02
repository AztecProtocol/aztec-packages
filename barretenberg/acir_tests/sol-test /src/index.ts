import fs from "fs";
import { gunzipSync } from "zlib";
import os from "os";
import {spawn} from "child_process";


const readBytecodeFile = (path: string): Uint8Array => {
  const data = fs.readFileSync(path);
  const buffer = gunzipSync(data);
  return buffer;
};

const readWitnessFile = (path: string): Uint8Array => {
  const buffer = fs.readFileSync(path);
  return gunzipSync(buffer);
};


const launchAnvil = async () => {
  const handle = spawn("anvil");
  console.log("Anvil Launched");
  handle.on("close", (code) => {
    console.log(`anvil exited with code ${code}`)
  });

  // wait until the anvil instance is ready on port 8545
  await new Promise((resolve) => {
    handle.stdout.on("data", (data) => {
      const str = data.toString();
      if (str.includes("Listening on")) {
        console.log("Anvil Ready");
        resolve(undefined);
      }
    });
  });

  return handle;
}

// start anvil
async function main() {
  const anvil = await launchAnvil();
  const killAnvil = () => {
    anvil.kill();
  }

  // Get the contract artifact




  // Kill anvil at the end of running
  killAnvil();
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

