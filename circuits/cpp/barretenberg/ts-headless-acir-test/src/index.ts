import { chromium, firefox, webkit } from "playwright";
import fs from "fs";
import { Command } from "commander";
import { gunzipSync } from "zlib";
import chalk from "chalk";
import os from "os";

const { BROWSER } = process.env;

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
  const acir = readBytecodeFile(options.bytecode);
  const witness = readWitnessFile(options.witness);
  const threads = Math.min(os.cpus().length, 16);

  const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

  for (const [name, browserType] of Object.entries(browsers)) {
    if (BROWSER && BROWSER != name) {
      continue;
    }
    console.log(chalk.blue(`Testing ${options.bytecode} in ${name}...`));
    const browser = await browserType.launch();

    const context = await browser.newContext();
    const page = await context.newPage();

    if (options.verbose) {
      page.on("console", (msg) => formatAndPrintLog(msg.text()));
    }

    await page.goto("http://localhost:8080");

    const result: boolean = await page.evaluate(
      ([acirData, witnessData, threads]) => {
        // Convert the input data to Uint8Arrays within the browser context
        const acirUint8Array = new Uint8Array(acirData as number[]);
        const witnessUint8Array = new Uint8Array(witnessData as number[]);

        // Call the desired function and return the result
        return (window as any).runTest(
          acirUint8Array,
          witnessUint8Array,
          threads
        );
      },
      [Array.from(acir), Array.from(witness), threads]
    );

    await browser.close();

    if (!result) {
      process.exit(1); // Exit with an error if any of the browsers fail
    }
  }

  process.exit(0);
})();
