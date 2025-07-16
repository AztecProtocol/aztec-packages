import { BarretenbergWasmMain } from './barretenberg_wasm/barretenberg_wasm_main/index.js';
import { clientIvcStart } from './cbind/cbind.gen.js';
import { fetchModuleAndThreads } from './barretenberg_wasm/index.js';
import { createDebugLogger } from './log/index.js';
import { Crs } from './crs/index.js';
import { Barretenberg } from './barretenberg/index.js';
import { RawBuffer } from './types/raw_buffer.js';

async function initBb() {
  const api = await Barretenberg.new({ threads: 1 });
  const crs = await Crs.new(2**20, process.env.HOME + '/.bb-crs');

  // Load CRS into wasm global CRS state.
  await api.srsInitSrs(new RawBuffer(crs.getG1Data()), crs.numPoints, new RawBuffer(crs.getG2Data()));
  return api;
}

async function test() {
  const logger = console.log;

  try {
    logger('Loading WASM module...');

    // Load the WASM module using the existing infrastructure
    const { module, threads } = await fetchModuleAndThreads(1);

    // Create BarretenbergWasmMain instance
    const api = await initBb();

    logger('WASM initialized successfully');

    // Initialize CRS manually using raw WASM calls
    logger('Initializing CRS...');

    // Create a test command with all required fields
    const command = {
      numCircuits: 1
    };

    logger('Calling clientIvcStart...');
    const result = await clientIvcStart(api, command);

    logger('Success! Result:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    logger('Error occurred:');
    console.error(error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

test();
