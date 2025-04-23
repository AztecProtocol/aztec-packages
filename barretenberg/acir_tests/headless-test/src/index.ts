import { chromium, firefox, webkit } from "playwright";
import fs from "fs";
import { Command } from "commander";
import chalk from "chalk";
import os from "os";
import type { ProofData } from "@aztec/bb.js";

const { BROWSER, PORT = "8080" } = process.env;

function formatAndPrintLog(message: string): void {
  const parts = message.split("%c");
  if (parts.length === 1) {
    console.log(parts[0]);
    return;
  }
  if (!parts[0]) {
    parts.shift();
  }
  const colors = parts[parts.length - 1].split(" color: ");
  parts[parts.length - 1] = colors.shift()!;

  // console.log({ message, parts, colors });

  let formattedMessage = "";
  for (let i = 0; i < parts.length; i++) {
    const colorValue = colors[i];

    if (colorValue === "inherit" || !colorValue) {
      formattedMessage += parts[i];
    } else if (colorValue.startsWith("#")) {
      formattedMessage += chalk.hex(colorValue)(parts[i]);
    } else {
      formattedMessage += parts[i];
    }
  }

  console.log(formattedMessage);
}

const readBytecodeFile = (path: string): string => {
  const encodedCircuit = JSON.parse(fs.readFileSync(path, "utf8"));
  return encodedCircuit.bytecode;
};

const readWitnessFile = (path: string): Uint8Array => {
  const buffer = fs.readFileSync(path);
  return buffer;
};

// Set up the command-line interface
const program = new Command("headless_test");
program.option("-v, --verbose", "verbose logging");
program.option("-c, --crs-path <path>", "ignored (here for compatibility)");

program
  .command("prove_and_verify")
  .description(
    "Generate a proof and verify it. Process exits with success or failure code."
  )
  .option(
    "-b, --bytecode-path <path>",
    "Specify the path to the ACIR artifact json file",
    "./target/acir.json"
  )
  .option(
    "-w, --witness-path <path>",
    "Specify the path to the gzip encoded ACIR witness",
    "./target/witness.gz"
  )
  .action(async ({ bytecodePath, witnessPath }) => {
    const acir = readBytecodeFile(bytecodePath);
    const witness = readWitnessFile(witnessPath);
    const threads = Math.min(os.cpus().length, 16);

    const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

    for (const [name, browserType] of Object.entries(browsers)) {
      if (BROWSER && !BROWSER.split(",").includes(name)) {
        continue;
      }
      console.log(chalk.blue(`Testing ${bytecodePath} in ${name}...`));
      const browser = await browserType.launch();

      const context = await browser.newContext();
      const provingPage = await context.newPage();

      if (program.opts().verbose) {
        provingPage.on("console", (msg) => formatAndPrintLog(msg.text()));
      }

      await provingPage.goto(`http://localhost:${PORT}`);

      const {
        publicInputs,
        proof,
        verificationKey,
      }: {
        publicInputs: string[];
        proof: number[];
        verificationKey: number[];
      } = await provingPage.evaluate(
        async ([acir, witnessData, threads]: [string, number[], number]) => {
          // Convert the input data to Uint8Arrays within the browser context
          const witnessUint8Array = new Uint8Array(witnessData);

          // Call the desired function and return the result
          const {
            proofData,
            verificationKey,
          }: { proofData: ProofData; verificationKey: Uint8Array } = await (
            window as any
          ).prove(acir, witnessUint8Array, threads);

          return {
            publicInputs: proofData.publicInputs,
            proof: Array.from(proofData.proof),
            verificationKey: Array.from(verificationKey),
          };
        },
        [acir, Array.from(witness), threads]
      );
      await provingPage.close();

      // Creating a new page to verify the proof, so this bug is avoided
      // https://bugs.webkit.org/show_bug.cgi?id=245346
      // Present at least on playwright 1.49.0

      const verificationPage = await context.newPage();
      await verificationPage.goto(`http://localhost:${PORT}`);

      if (program.opts().verbose) {
        verificationPage.on("console", (msg) => formatAndPrintLog(msg.text()));
      }

      const verificationResult: boolean = await verificationPage.evaluate(
        ([publicInputs, proof, verificationKey]: [
          string[],
          number[],
          number[]
        ]) => {
          const verificationKeyUint8Array = new Uint8Array(verificationKey);
          const proofData: ProofData = {
            publicInputs,
            proof: new Uint8Array(proof),
          };
          return (window as any).verify(proofData, verificationKeyUint8Array);
        },
        [publicInputs, proof, verificationKey]
      );

      await browser.close();

      if (!verificationResult) {
        process.exit(1);
      }
    }
  });

program.parse(process.argv);
