import { chromium, firefox, webkit } from "playwright";
import fs from "fs";
import { Command } from "commander";
import { ungzip } from "pako";
import { decode } from "@msgpack/msgpack";
import chalk from "chalk";
import os from "os";

const { BROWSER } = process.env;

function formatAndPrintLog(message: string): void {
  console.log(message);
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

function base64ToUint8Array(base64: string) {
  let binaryString = atob(base64);
  let len = binaryString.length;
  let bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function readStack(bytecodePath: string, numToDrop: number) {
  const encodedCircuit = base64ToUint8Array(
    fs.readFileSync(bytecodePath, "utf8")
  );
  const unpacked = decode(
    encodedCircuit.subarray(0, encodedCircuit.length - numToDrop)
  ) as Uint8Array[];
  const decompressed = unpacked.map((arr: Uint8Array) => ungzip(arr));
  return decompressed;
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
  .command("client_ivc_prove_and_verify")
  .description(
    "Generate a proof and verify it. Process exits with success or failure code."
  )
  .option(
    "-b, --bytecode-path <path>",
    "Specify the path to the ACIR artifact json file",
    "./target/acir.msgpack.b64"
  )
  .option(
    "-w, --witness-path <path>",
    "Specify the path to the gzip encoded ACIR witness",
    "./target/witnesses.msgpack.b64"
  )
  .action(async ({ bytecodePath, witnessPath, recursive }) => {
    console.log("reading stacks...");
    const acir = readStack(bytecodePath, 0);
    const witness = readStack(witnessPath, 0);
    const threads = Math.min(os.cpus().length, 16);

    const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

    for (const [name, browserType] of Object.entries(browsers)) {
      if (BROWSER && !BROWSER.split(",").includes(name)) {
        continue;
      }
      console.log(chalk.blue(`Testing ${bytecodePath} in ${name}...`));
      const browser = await browserType.launch();

      const context = await browser.newContext();
      context.on("console", (msg) => {
        console.log(`[${msg.type()}] ${msg.text()}`);
      });

      const page = await context.newPage();

      // if (program.opts().verbose) {
      console.log("verbose is turned on!");
      page.on("console", (msg) => formatAndPrintLog(msg.text()));
      // }

      console.log("going to page");
      await page.goto("http://localhost:8080");
      console.log("went to page");

      await page.evaluate(() => console.log("This is a log from the browser!"));
      await page.evaluate(() =>
        console.debug("This is a debug log from the browser!")
      );
      await page.evaluate(() =>
        console.info("This is an info log from the browser!")
      );
      const result: boolean = await page.evaluate(
        ([acir, witness, threads]: [Uint8Array[], Uint8Array[], number]) => {
          // Call the desired function and return the result
          return (window as any).runTest(acir, witness, threads);
        },
        [acir, witness, threads]
      );

      await browser.close();

      if (!result) {
        process.exit(1);
      }
    }
  });

program.parse(process.argv);
