import { chromium, firefox, webkit } from "playwright";
import type { Page, BrowserContext } from "playwright";
import fs from "fs";
import { Command } from "commander";
import chalk from "chalk";
import os from "os";
import type { ProofData } from "@aztec/bb.js";
const { BROWSER, PORT = "8080" } = process.env;

if (!["chrome", "firefox", "webkit"].includes(BROWSER || "")) {
  throw new Error(
    "BROWSER environment variable is not set. Set it to 'chrome', 'firefox', or 'webkit'."
  );
}

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

function setupPageLogging(page: Page, context: BrowserContext): void {
  page.on("console", (msg) => formatAndPrintLog(msg.text()));
  page.on("pageerror", (error) => {
    console.error(chalk.red("Page error:"), error);
  });
  page.on("crash", () => {
    console.error(chalk.red("Page crashed!"));
  });
  page.on("requestfailed", (request) => {
    console.error(
      chalk.red("Request failed:"),
      request.url(),
      request.failure()?.errorText
    );
  });

  context.on("weberror", (webError) => {
    console.error(chalk.red("Web error:"), webError);
  });
}

const readBytecodeFile = (path: string): string => {
  const encodedCircuit = JSON.parse(fs.readFileSync(path, "utf8"));
  return encodedCircuit.bytecode;
};

const readWitnessFile = (path: string): Uint8Array => {
  const buffer = fs.readFileSync(path);
  return buffer;
};

const readIvcInputsFile = (path: string): Uint8Array => {
  const buffer = fs.readFileSync(path);
  return buffer;
};

// Set up the command-line interface
const program = new Command("headless_test");
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

      setupPageLogging(provingPage, context);

      await provingPage.goto(`http://localhost:${PORT}`);

      let publicInputs: string[];
      let proof: number[];
      let verificationKey: number[];

      try {
        const result = await provingPage.evaluate(
          async (arg: any) => {
            try {
              // Convert the input data to Uint8Arrays within the browser context
              const acir = arg[0];
              const witnessData = arg[1];
              const threads = arg[2];
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
            } catch (error: any) {
              // Capture error details from browser context
              return {
                error: true,
                message: error.message || String(error),
                stack: error.stack || "",
                name: error.name || "Error",
              };
            }
          },
          [acir, Array.from(witness), threads]
        );

        if ((result as any).error) {
          const errorInfo = result as any;
          console.error(chalk.red("Error during proof generation:"));
          console.error(chalk.red(`  ${errorInfo.name}: ${errorInfo.message}`));
          if (errorInfo.stack) {
            console.error(chalk.red("Stack trace:"));
            console.error(chalk.gray(errorInfo.stack));
          }
          await provingPage.close();
          await browser.close();
          process.exit(1);
        }

        ({ publicInputs, proof, verificationKey } = result as {
          publicInputs: string[];
          proof: number[];
          verificationKey: number[];
        });
      } catch (error: any) {
        console.error(chalk.red("Playwright error during proof generation:"));
        console.error(chalk.red(`  ${error.message || String(error)}`));
        if (error.stack) {
          console.error(chalk.red("Stack trace:"));
          console.error(chalk.gray(error.stack));
        }
        await provingPage.close();
        await browser.close();
        process.exit(1);
      }

      await provingPage.close();

      // Creating a new page to verify the proof, so this bug is avoided
      // https://bugs.webkit.org/show_bug.cgi?id=245346
      // Present at least on playwright 1.49.0

      const verificationPage = await context.newPage();
      await verificationPage.goto(`http://localhost:${PORT}`);

      setupPageLogging(verificationPage, context);

      let verificationResult: boolean;
      try {
        const result = await verificationPage.evaluate(
          async (arg: any) => {
            try {
              const publicInputs = arg[0];
              const proof = arg[1];
              const verificationKey = arg[2];
              const verificationKeyUint8Array = new Uint8Array(verificationKey);
              const proofData: ProofData = {
                publicInputs,
                proof: new Uint8Array(proof),
              };
              return {
                result: await (window as any).verify(proofData, verificationKeyUint8Array),
              };
            } catch (error: any) {
              return {
                error: true,
                message: error.message || String(error),
                stack: error.stack || "",
                name: error.name || "Error",
              };
            }
          },
          [publicInputs, proof, verificationKey]
        );

        if ((result as any).error) {
          const errorInfo = result as any;
          console.error(chalk.red("Error during verification:"));
          console.error(chalk.red(`  ${errorInfo.name}: ${errorInfo.message}`));
          if (errorInfo.stack) {
            console.error(chalk.red("Stack trace:"));
            console.error(chalk.gray(errorInfo.stack));
          }
          await browser.close();
          process.exit(1);
        }

        verificationResult = (result as any).result;
      } catch (error: any) {
        console.error(chalk.red("Playwright error during verification:"));
        console.error(chalk.red(`  ${error.message || String(error)}`));
        if (error.stack) {
          console.error(chalk.red("Stack trace:"));
          console.error(chalk.gray(error.stack));
        }
        await browser.close();
        process.exit(1);
      }

      await browser.close();

      if (!verificationResult) {
        process.exit(1);
      }
    }
  });

program
  .command("prove_client_ivc")
  .description(
    "Generate a ClientIVC proof. Process exits with success or failure code."
  )
  .option(
    "-i, --ivc-inputs-path <path>",
    "Specify the path to the IVC inputs msgpack file",
    "./target/ivc-inputs.msgpack"
  )
  .action(async ({ ivcInputsPath }) => {
    const ivcInputs = readIvcInputsFile(ivcInputsPath);
    const threads = Math.min(os.cpus().length, 16);

    const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

    for (const [name, browserType] of Object.entries(browsers)) {
      if (BROWSER && !BROWSER.split(",").includes(name)) {
        continue;
      }
      console.log(
        chalk.blue(`Testing ClientIVC ${ivcInputsPath} in ${name}...`)
      );
      const browser = await browserType.launch();

      const context = await browser.newContext();
      const provingPage = await context.newPage();

      setupPageLogging(provingPage, context);

      await provingPage.goto(`http://localhost:${PORT}`);

      let verificationResult: boolean;
      try {
        const result = await provingPage.evaluate(
          async (arg: any) => {
            try {
              const ivcInputsUint8Array = new Uint8Array(arg[0]);
              const threads = arg[1];
              return {
                result: await (window as any).proveClientIvc(ivcInputsUint8Array, threads),
              };
            } catch (error: any) {
              return {
                error: true,
                message: error.message || String(error),
                stack: error.stack || "",
                name: error.name || "Error",
              };
            }
          },
          [Array.from(ivcInputs), threads]
        );

        if ((result as any).error) {
          const errorInfo = result as any;
          console.error(chalk.red("Error during ClientIVC proof generation:"));
          console.error(chalk.red(`  ${errorInfo.name}: ${errorInfo.message}`));
          if (errorInfo.stack) {
            console.error(chalk.red("Stack trace:"));
            console.error(chalk.gray(errorInfo.stack));
          }
          await browser.close();
          process.exit(1);
        }

        verificationResult = (result as any).result;
      } catch (error: any) {
        console.error(chalk.red("Playwright error during ClientIVC proof generation:"));
        console.error(chalk.red(`  ${error.message || String(error)}`));
        if (error.stack) {
          console.error(chalk.red("Stack trace:"));
          console.error(chalk.gray(error.stack));
        }
        await browser.close();
        process.exit(1);
      }

      await browser.close();
      if (!verificationResult) {
        process.exit(1);
      }
      console.log(chalk.green(`ClientIVC proof generated and self-verified successfully in ${name}.`));
    }
  });

program.parse(process.argv);
