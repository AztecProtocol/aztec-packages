import { chromium, firefox, webkit } from 'playwright';
import fs from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import { createServer, type Server } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { BROWSER } = process.env;
let server: Server | null = null;
let PORT = 0; // Will be set when server starts

if (!['chrome', 'firefox', 'webkit'].includes(BROWSER || '')) {
  throw new Error("BROWSER environment variable is not set. Set it to 'chrome', 'firefox', or 'webkit'.");
}

function formatAndPrintLog(message: string): void {
  const parts = message.split('%c');
  if (parts.length === 1) {
    console.log(parts[0]);
    return;
  }
  if (!parts[0]) {
    parts.shift();
  }
  const colors = parts[parts.length - 1].split(' color: ');
  parts[parts.length - 1] = colors.shift()!;

  // console.log({ message, parts, colors });

  let formattedMessage = '';
  for (let i = 0; i < parts.length; i++) {
    const colorValue = colors[i];

    if (colorValue === 'inherit' || !colorValue) {
      formattedMessage += parts[i];
    } else if (colorValue.startsWith('#')) {
      formattedMessage += chalk.hex(colorValue)(parts[i]);
    } else {
      formattedMessage += parts[i];
    }
  }

  console.log(formattedMessage);
}

const readBytecodeFile = (path: string): string => {
  const encodedCircuit = JSON.parse(fs.readFileSync(path, 'utf8'));
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
const program = new Command('headless_test');
program.option('-v, --verbose', 'verbose logging');
program.option('-c, --crs-path <path>', 'ignored (here for compatibility)');

program
  .command('prove_and_verify')
  .description('Generate a proof and verify it. Process exits with success or failure code.')
  .option('-b, --bytecode-path <path>', 'Specify the path to the ACIR artifact json file', './target/acir.json')
  .option('-w, --witness-path <path>', 'Specify the path to the gzip encoded ACIR witness', './target/witness.gz')
  .action(async ({ bytecodePath, witnessPath }) => {
    const acir = readBytecodeFile(bytecodePath);
    const witness = readWitnessFile(witnessPath);
    const threads = Math.min(os.cpus().length, 16);

    const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

    for (const [name, browserType] of Object.entries(browsers)) {
      if (BROWSER && !BROWSER.split(',').includes(name)) {
        continue;
      }
      console.log(chalk.blue(`Testing ${bytecodePath} in ${name}...`));
      const browser = await browserType.launch();

      const context = await browser.newContext();
      const provingPage = await context.newPage();

      if (program.opts().verbose) {
        provingPage.on('console', msg => formatAndPrintLog(msg.text()));
      }

      await provingPage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

      // Wait for module to load and install globals (poll for window.prove)
      await provingPage.evaluate(async () => {
        for (let i = 0; i < 100; i++) {
          if (typeof (window as any).prove === 'function') return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('window.prove function not available after 10 seconds');
      });

      const {
        publicInputs,
        proof,
        verificationKey,
      }: {
        publicInputs: string[];
        proof: number[];
        verificationKey: number[];
      } = await provingPage.evaluate(
        async (args: any) => {
          // Convert the input data to Uint8Arrays within the browser context
          const [acir, witnessData, threads] = args;
          const witnessUint8Array = new Uint8Array(witnessData);

          // Call the desired function and return the result
          const { proofData, verificationKey } = await (window as any).prove(acir, witnessUint8Array, threads);

          return {
            publicInputs: proofData.publicInputs,
            proof: Array.from(proofData.proof),
            verificationKey: Array.from(verificationKey),
          };
        },
        [acir, Array.from(witness), threads],
      );
      await provingPage.close();

      // Creating a new page to verify the proof, so this bug is avoided
      // https://bugs.webkit.org/show_bug.cgi?id=245346
      // Present at least on playwright 1.49.0

      const verificationPage = await context.newPage();
      await verificationPage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

      if (program.opts().verbose) {
        verificationPage.on('console', msg => formatAndPrintLog(msg.text()));
      }

      // Wait for module to load and install globals (poll for window.verify)
      await verificationPage.evaluate(async () => {
        for (let i = 0; i < 100; i++) {
          if (typeof (window as any).verify === 'function') return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('window.verify function not available after 10 seconds');
      });

      const verificationResult: boolean = await verificationPage.evaluate(
        (args: any) => {
          const [publicInputs, proof, verificationKey] = args;
          const verificationKeyUint8Array = new Uint8Array(verificationKey);
          const proofData = {
            publicInputs,
            proof: new Uint8Array(proof),
          };
          return (window as any).verify(proofData, verificationKeyUint8Array);
        },
        [publicInputs, proof, verificationKey],
      );

      await browser.close();

      if (!verificationResult) {
        process.exit(1);
      }
    }
  });

program
  .command('prove_chonk')
  .description('Generate a Chonk proof. Process exits with success or failure code.')
  .option(
    '-i, --ivc-inputs-path <path>',
    'Specify the path to the IVC inputs msgpack file',
    './target/ivc-inputs.msgpack',
  )
  .action(async ({ ivcInputsPath }) => {
    const ivcInputs = readIvcInputsFile(ivcInputsPath);
    const threads = Math.min(os.cpus().length, 16);

    const browsers = { chrome: chromium, firefox: firefox, webkit: webkit };

    for (const [name, browserType] of Object.entries(browsers)) {
      if (BROWSER && !BROWSER.split(',').includes(name)) {
        continue;
      }
      console.log(chalk.blue(`Testing Chonk ${ivcInputsPath} in ${name}...`));
      const browser = await browserType.launch();

      const context = await browser.newContext();
      const provingPage = await context.newPage();

      if (program.opts().verbose) {
        provingPage.on('console', msg => formatAndPrintLog(msg.text()));
      }

      await provingPage.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });

      // Wait for module to load and install globals (poll for window.proveChonk)
      await provingPage.evaluate(async () => {
        for (let i = 0; i < 100; i++) {
          if (typeof (window as any).proveChonk === 'function') return;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('window.proveChonk function not available after 10 seconds');
      });

      const verificationResult: boolean = await provingPage.evaluate(
        async (args: any) => {
          const [ivcInputsData, threads] = args;
          const ivcInputsUint8Array = new Uint8Array(ivcInputsData);
          return await (window as any).proveChonk(ivcInputsUint8Array, threads);
        },
        [Array.from(ivcInputs), threads],
      );

      await browser.close();
      if (!verificationResult) {
        process.exit(1);
      }
      console.log(chalk.green(`Chonk proof generated and self-verified successfully in ${name}.`));
    }
  });

// Helper function to start the test server
function startTestServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // Find the browser-test-app dist directory
    // From headless-test/dest, go to ../browser-test-app/dest
    const distPath = join(__dirname, '..', '..', 'browser-test-app', 'dest');

    if (!fs.existsSync(distPath)) {
      reject(new Error(`Browser test app dist not found at: ${distPath}`));
      return;
    }

    console.log(`Starting test server, serving from: ${distPath}`);

    server = createServer((req, res) => {
      // Set COOP/COEP headers for SharedArrayBuffer support
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'no-store');

      if (req.url === '/') {
        // Redirect to index.html
        res.writeHead(302, { Location: '/index.html' });
        res.end();
      } else {
        // Serve files from dist directory
        const filePath = join(distPath, req.url || '');
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath);
            const ext = filePath.split('.').pop() || '';
            const contentTypes: Record<string, string> = {
              js: 'application/javascript; charset=utf-8',
              wasm: 'application/wasm',
              json: 'application/json',
              css: 'text/css',
              html: 'text/html; charset=utf-8',
            };
            res.writeHead(200, {
              'Content-Type': contentTypes[ext] || 'application/octet-stream',
              'Content-Length': content.length,
            });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not found: ' + req.url);
          }
        } catch (error: any) {
          console.error(`[Server] Error serving ${req.url}:`, error.message);
          res.writeHead(500);
          res.end('Server error: ' + error.message);
        }
      }
    });

    server.listen(0, () => {
      const addr = server!.address();
      if (addr && typeof addr === 'object') {
        console.log(`Test server started on http://localhost:${addr.port}`);
        resolve(addr.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });

    server.on('error', error => {
      console.error('[Server] Error:', error);
      reject(error);
    });
  });
}

// Cleanup server on exit
function cleanup() {
  if (server) {
    server.close(() => {
      console.log('Server closed');
    });
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

// Start server and then parse commands
(async () => {
  try {
    PORT = await startTestServer();
    await program.parseAsync(process.argv);
    // Commands completed, cleanup and exit
    cleanup();
    process.exit(0);
  } catch (error) {
    console.error('Failed to start test server:', error);
    cleanup();
    process.exit(1);
  }
})();
