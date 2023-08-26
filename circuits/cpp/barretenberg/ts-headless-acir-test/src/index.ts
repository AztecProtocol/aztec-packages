import puppeteer from "puppeteer";
import fs from "fs";
import { Command } from "commander";
import { gunzipSync } from "zlib";
import chalk from "chalk";
import os from "os";

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

// Set up the command-line interface
const program = new Command();
program.option("-v, --verbose", "verbose logging");
program.option("-c, --crs-path <path>", "ignored (here for compatability)");
program.option("-b, --bytecode <path>", "path to the bytecode file");
program.option(
  "-w, --witness <path>",
  "path to the witness file",
  "./target/witness.tr"
);
program.parse(process.argv);
const options = program.opts();

if (!options.bytecode) {
  console.error("Please provide a bytecode path using the -b flag.");
  process.exit(1);
}

const readBytecodeFile = (path: string): Uint8Array => {
  const data = fs.readFileSync(path, "ascii");
  const buffer = gunzipSync(Buffer.from(data, "base64"));
  return buffer;
};

const readWitnessFile = (path: string): Uint8Array => {
  const buffer = fs.readFileSync(path);
  return gunzipSync(buffer);
};

(async () => {
  // Launch puppeteer and navigate to the desired URL
  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 600000,
  });

  const page = await browser.newPage();
  if (options.verbose) {
    page.on("console", (msg) => formatAndPrintLog(msg.text()));
  }

  await page.goto("http://localhost:8080");

  // Read the required binary files
  const acir = readBytecodeFile(options.bytecode);
  const witness = readWitnessFile(options.witness);
  const threads = Math.min(os.cpus().length, 16);

  // Call the desired function inside the loaded page and capture the return value
  const result: boolean = await page.evaluate(
    (acirData, witnessData, threads) => {
      // Convert the input data to Uint8Arrays within the browser context
      const acirUint8Array = new Uint8Array(acirData);
      const witnessUint8Array = new Uint8Array(witnessData);

      // Call the desired function and return the result
      return (window as any).runTest(
        acirUint8Array,
        witnessUint8Array,
        threads
      );
    },
    Array.from(acir),
    Array.from(witness),
    threads
  );

  await browser.close();

  process.exit(result ? 0 : 1);
})();
