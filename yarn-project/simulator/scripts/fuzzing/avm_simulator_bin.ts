var { GasFees, Gas, GasSettings } = require('@aztec/stdlib/gas');
var { deserializeFromMessagePack, PublicSimulatorConfig, RevertCode } = require('@aztec/stdlib/avm');

var { createInstrumenter } = require('istanbul-lib-instrument');
var { hookRequire } = require('istanbul-lib-hook');
var { gzipSync } = require('zlib');

const INSTRUMENTER = createInstrumenter({ compact: true });

hookRequire(
  (filePath: string): boolean => {
    // Don't instrument node_modules because there's something funky with babel + browserlists dependencies
    return !filePath.includes('node_modules');
  },
  (code: string, { filename }: { filename: string }): string => {
    const newCode = INSTRUMENTER.instrumentSync(code, filename);
    return newCode;
  },
);
var { Fr } = require('@aztec/foundation/fields');
var { AztecAddress } = require('@aztec/stdlib/aztec-address');
var { GlobalVariables, Tx, TxHash, HashedValues } = require('@aztec/stdlib/tx');
var { EthAddress } = require('@aztec/foundation/eth-address');
var { NativeWorldStateService } = require('@aztec/world-state');
var { WorldStateRevision } = require('@aztec/stdlib/world-state');
// Import internal facade for direct fork access
var { MerkleTreesForkFacade } = require('@aztec/world-state/native/merkle_trees_facade');
var {
  PrivateKernelTailCircuitPublicInputs,
  TxConstantData,
  TxContext,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
} = require('@aztec/stdlib/kernel');
var { PartialPrivateTailPublicInputsForPublic } = require('@aztec/stdlib/kernel');
var { ChonkProof } = require('@aztec/stdlib/proofs');

var { createInterface } = require('readline');
var { writeSync } = require('fs');

var { AvmSimulator } = require('../../public/avm/avm_simulator.js');
var { SimpleContractDataSource } = require('../../public/fixtures/simple_contract_data_source.js');
var { PublicContractsDB, PublicTreesDB } = require('../../public/public_db_sources.js');
var { SideEffectTrace } = require('../../public/side_effect_trace.js');
var { PublicPersistableStateManager } = require('../../public/state_manager/state_manager.js');
var { PublicTxSimulator } = require('../../public/public_tx_simulator/public_tx_simulator.js');
var { AvmTxHint } = require('../../public/fuzzer/avm_tx_hint.js');

// Type declaration for Istanbul coverage
interface CoverageStatement {
  [statementId: string]: number;
}

interface CoverageFunction {
  [functionId: string]: number;
}

interface CoverageBranch {
  [branchId: string]: number[];
}

interface FileCoverageData {
  s: CoverageStatement; // statements
  f: CoverageFunction; // functions
  b: CoverageBranch; // branches
}

interface GlobalCoverage {
  [filePath: string]: FileCoverageData;
}

// Extend global interface to include __coverage__
declare global {
  var __coverage__: GlobalCoverage | undefined;
}

function stringToField(str: string): typeof Fr {
  let number = BigInt(str);
  if (number < 0) {
    number = Fr.MODULUS + number;
  }
  return new Fr(number);
}

function stringArrayToFields(arr: string[]): (typeof Fr)[] {
  return arr.map(stringToField);
}

/**
 * Creates a TypeScript Tx object from a deserialized C++ Tx (AvmTxHint-like structure).
 * This allows using PublicTxSimulator.simulate() with fuzzer-generated transactions.
 *
 * @param cppTx - Deserialized C++ Tx from msgpack (matches AvmTxHint structure)
 * @returns A TypeScript Tx suitable for PublicTxSimulator
 */
function createFuzzerTx(cppTx: typeof AvmTxHint): typeof Tx {
  // Create TxHash from the C++ tx hash string
  const txHash = TxHash.fromString(cppTx.hash);

  // Build PrivateToPublicAccumulatedData for non-revertible
  const nonRevertibleAccumulatedData = new PrivateToPublicAccumulatedData(
    cppTx.nonRevertibleAccumulatedData.noteHashes || [],
    cppTx.nonRevertibleAccumulatedData.nullifiers || [],
    cppTx.nonRevertibleAccumulatedData.l2ToL1Messages || [],
    [], // privateLogs
    [], // contractClassLogsHashes
    cppTx.setupEnqueuedCalls || [], // publicCallRequests - setup calls go here
  );

  // Build PrivateToPublicAccumulatedData for revertible
  const revertibleAccumulatedData = new PrivateToPublicAccumulatedData(
    cppTx.revertibleAccumulatedData.noteHashes || [],
    cppTx.revertibleAccumulatedData.nullifiers || [],
    cppTx.revertibleAccumulatedData.l2ToL1Messages || [],
    [], // privateLogs
    [], // contractClassLogsHashes
    cppTx.appLogicEnqueuedCalls || [], // publicCallRequests - app logic calls go here
  );

  // Build teardown call request (if exists)
  const teardownCallRequest = cppTx.teardownEnqueuedCall
    ? new PublicCallRequest(
        new AztecAddress(cppTx.teardownEnqueuedCall.request.msgSender),
        new AztecAddress(cppTx.teardownEnqueuedCall.request.contractAddress),
        cppTx.teardownEnqueuedCall.request.isStaticCall,
        new Fr(cppTx.teardownEnqueuedCall.request.calldataHash || 0),
      )
    : PublicCallRequest.empty();

  // Create forPublic structure
  const forPublic = new PartialPrivateTailPublicInputsForPublic(
    nonRevertibleAccumulatedData,
    revertibleAccumulatedData,
    teardownCallRequest,
  );

  // Build GasSettings from C++ tx
  const gasSettings = new GasSettings(
    new Gas(Number(cppTx.gasSettings.gasLimits.l2Gas), Number(cppTx.gasSettings.gasLimits.daGas)),
    new Gas(
      Number(cppTx.gasSettings.teardownGasLimits?.l2Gas || 0),
      Number(cppTx.gasSettings.teardownGasLimits?.daGas || 0),
    ),
    new GasFees(
      Number(cppTx.gasSettings.maxFeesPerGas?.feePerDaGas || 0),
      Number(cppTx.gasSettings.maxFeesPerGas?.feePerL2Gas || 0),
    ),
    new GasFees(
      Number(cppTx.gasSettings.maxPriorityFeesPerGas?.feePerDaGas || 0),
      Number(cppTx.gasSettings.maxPriorityFeesPerGas?.feePerL2Gas || 0),
    ),
  );

  // Build TxContext
  const txContext = new TxContext(
    Fr.ZERO, // chainId - will be overridden by globalVariables
    Fr.ZERO, // version - will be overridden by globalVariables
    gasSettings,
  );

  // Build TxConstantData
  const constants = new TxConstantData(
    Fr.ZERO, // historicalHeader (unused in simulation)
    txContext,
    Fr.ZERO, // vkTreeRoot
    Fr.ZERO, // protocolContractTreeRoot
    Fr.ZERO, // globalVariablesHash
  );

  // Build PrivateKernelTailCircuitPublicInputs
  const gasUsedByPrivate = new Gas(
    Number(cppTx.gasUsedByPrivate?.l2Gas || 0),
    Number(cppTx.gasUsedByPrivate?.daGas || 0),
  );

  const data = new PrivateKernelTailCircuitPublicInputs(
    constants,
    gasUsedByPrivate,
    new AztecAddress(cppTx.feePayer),
    0n, // includeByTimestamp
    forPublic,
    undefined, // forRollup - not needed for public simulation
  );

  // Build publicFunctionCalldata from all enqueued calls
  const publicFunctionCalldata: (typeof HashedValues)[] = [];

  // Add setup calls
  for (const call of cppTx.setupEnqueuedCalls || []) {
    publicFunctionCalldata.push(new HashedValues(call.calldata || []));
  }

  // Add app logic calls
  for (const call of cppTx.appLogicEnqueuedCalls || []) {
    publicFunctionCalldata.push(new HashedValues(call.calldata || []));
  }

  // Add teardown call if present
  if (cppTx.teardownEnqueuedCall) {
    publicFunctionCalldata.push(new HashedValues(cppTx.teardownEnqueuedCall.calldata || []));
  }

  // Create the Tx
  return new Tx(
    txHash,
    data,
    ChonkProof.empty(), // No real proof needed for simulation
    [], // contractClassLogFields - empty for fuzzer
    publicFunctionCalldata,
  );
}

const DEFAULT_TIMESTAMP = 1000000;

// Cache for opened world state services by data directory path
const worldStateCache: Map<string, typeof NativeWorldStateService> = new Map();

// Open an existing WorldState database created by C++
async function openExistingWorldState(dataDir: string, mapSizeKb: number): Promise<typeof NativeWorldStateService> {
  // Check cache first
  let ws = worldStateCache.get(dataDir);
  if (ws) {
    return ws;
  }

  // Open the existing database with matching map sizes
  const worldStateTreeMapSizes = {
    archiveTreeMapSizeKb: mapSizeKb,
    nullifierTreeMapSizeKb: mapSizeKb,
    noteHashTreeMapSizeKb: mapSizeKb,
    messageTreeMapSizeKb: mapSizeKb,
    publicDataTreeMapSizeKb: mapSizeKb,
  };

  ws = await NativeWorldStateService.new(EthAddress.ZERO, dataDir, worldStateTreeMapSizes);

  worldStateCache.set(dataDir, ws);
  return ws;
}

let STATE_MANAGER: typeof PublicPersistableStateManager | undefined;

async function getStateManager(): Promise<typeof PublicPersistableStateManager> {
  const contractDataSource = new SimpleContractDataSource();
  const worldStateService = await NativeWorldStateService.tmp();
  if (!worldStateService) {
    throw new Error('NativeWorldStateService.tmp() returned undefined');
  }
  const merkleTrees = await worldStateService.fork();
  if (!merkleTrees) {
    throw new Error('worldStateService.fork() returned undefined');
  }
  const treesDb = new PublicTreesDB(merkleTrees);
  const contractsDb = new PublicContractsDB(contractDataSource);
  const trace = new SideEffectTrace();
  const firstNullifier = new Fr(0xdeadbeef);
  const stateManager = PublicPersistableStateManager.create(
    treesDb,
    contractsDb,
    trace,
    firstNullifier,
    DEFAULT_TIMESTAMP,
  );
  if (!stateManager) {
    throw new Error('PublicPersistableStateManager.create() returned undefined');
  }
  return stateManager;
}

async function initSimulator() {
  if (STATE_MANAGER) {
    return;
  }
  try {
    STATE_MANAGER = await getStateManager();
    if (!STATE_MANAGER) {
      throw new Error('getStateManager() returned undefined');
    }
  } catch (error) {
    // Reset STATE_MANAGER to undefined on error so we can retry
    STATE_MANAGER = undefined;
    throw new Error(`Failed to initialize state manager: ${error.message}`);
  }
}

async function getSimulator(calldata: (typeof Fr)[]) {
  await initSimulator();

  if (!STATE_MANAGER) {
    throw new Error('State manager not initialized. This may happen if initialization failed after restart.');
  }

  const globalVariables = GlobalVariables.empty();
  globalVariables.chainId = new Fr(1);
  globalVariables.version = new Fr(1);
  globalVariables.blockNumber = 1;
  globalVariables.slotNumber = new Fr(1);
  globalVariables.timestamp = 1000000;
  globalVariables.coinbase = AztecAddress.ZERO;
  globalVariables.feeRecipient = AztecAddress.ZERO;
  globalVariables.gasFees = new GasFees(1, 1);

  const config = PublicSimulatorConfig.from({
    skipFeeEnforcement: true,
    collectDebugLogs: false,
    collectHints: false,
    collectStatistics: false,
    collectCallMetadata: false,
  });

  const simulator = await AvmSimulator.create(
    STATE_MANAGER,
    AztecAddress.fromNumber(42), // address
    AztecAddress.fromNumber(100), // sender
    new Fr(0), // transaction fee
    globalVariables,
    false, // is static call
    calldata,
    { l2Gas: 1000000, daGas: 1000000 },
    config,
  );
  return simulator;
}

/**
 * Execute a transaction using PublicTxSimulator.
 * This is the full transaction simulation path that matches the C++ AVM simulator.
 *
 * @param dataDir - World state data directory
 * @param mapSizeKb - World state map size in KB
 * @param forkId - The fork ID to use (from C++ FuzzerWorldStateManager)
 * @param bytecode - AVM bytecode to execute
 * @param cppTx - Deserialized C++ Tx from msgpack
 * @param cppGlobals - Deserialized C++ GlobalVariables from msgpack
 * @returns Simulation result with reverted status and output
 */
async function simulateWithPublicTxSimulator(
  dataDir: string,
  mapSizeKb: number,
  forkId: number,
  bytecode: Buffer,
  cppTx: typeof AvmTxHint,
  cppGlobals: typeof GlobalVariables,
): Promise<{ reverted: boolean; output: (typeof Fr)[]; revertReason?: string }> {
  // Open the existing WorldState database created by C++
  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);
  // Use the same fork as C++ by creating facade directly with the fork ID
  const revision = new WorldStateRevision(forkId, 0, true);
  const merkleTrees = new MerkleTreesForkFacade(worldStateService.instance, worldStateService.initialHeader, revision);

  // FIXME: This only works while we have a single app logic call
  // Get contract address from the app logic call
  const appLogicCall = cppTx.appLogicEnqueuedCalls[0];
  const contractAddress = new AztecAddress(appLogicCall.request.contractAddress);
  // Create contract data source and register bytecode
  const contractDataSource = new SimpleContractDataSource();
  // Register the bytecode at the contract address
  await contractDataSource.addContractWithBytecode(contractAddress, bytecode);

  // Create the contracts DB
  const contractsDb = new PublicContractsDB(contractDataSource);

  // Build GlobalVariables from deserialized msgpack data
  const globalVariables = cppGlobals;

  // Create the PublicTxSimulator
  const config = {
    skipFeeEnforcement: true,
    collectDebugLogs: false,
    collectHints: false,
    collectStatistics: false,
    collectCallMetadata: false,
  };
  const publicTxSimulator = new PublicTxSimulator(merkleTrees, contractsDb, globalVariables, config);

  // Create a TypeScript Tx from the C++ Tx
  const tx = createFuzzerTx(cppTx);

  // Simulate the transaction
  const result = await publicTxSimulator.simulate(tx);

  // Extract output from appLogicReturnValues
  const output: (typeof Fr)[] = [];
  for (const returnValues of result.appLogicReturnValues) {
    if (returnValues.values) {
      for (const value of returnValues.values) {
        output.push(value);
      }
    }
  }

  const reverted = !result.revertCode.isOK();
  const revertReason = result.revertReason?.message;

  return { reverted, output, revertReason };
}

const FLATTENED_COVERAGE_MAP: Map<string, number> = new Map();

// Report the coverage and reset the global coverage
// Sets every Program Counter to 0
// @returns the flattened coverage map
//
// The reason why we reset the coverage is because istanbul increment the PCs every time it encountered this counter
// For instance, executeBytecode executes every time in a loop, so the corresponding PC will be incremented by 1 for each execution
// We only want to count `new` coverage, so we reset the global coverage after each execution
function report_and_reset_coverage(): Map<string, number> {
  if (!global.__coverage__) {
    return new Map();
  }

  const coverage = global.__coverage__;
  const flat: Map<string, number> = FLATTENED_COVERAGE_MAP;
  const filePaths = Object.keys(coverage);
  const filePathsLength = filePaths.length;

  for (let i = 0; i < filePathsLength; i++) {
    const fileData = coverage[filePaths[i]];

    // Flatten and reset statements
    const statements = fileData.s;
    const stmtIds = Object.keys(statements);
    const stmtIdsLength = stmtIds.length;
    for (let j = 0; j < stmtIdsLength; j++) {
      const stmtId = stmtIds[j];
      flat.set('s_' + stmtId, statements[stmtId] ? 1 : 0);
      global.__coverage__[filePaths[i]].s[stmtId] = 0;
    }

    // Flatten and reset functions
    const functions = fileData.f;
    const funcIds = Object.keys(functions);
    const funcIdsLength = funcIds.length;
    for (let j = 0; j < funcIdsLength; j++) {
      const funcId = funcIds[j];
      flat.set('f_' + funcId, functions[funcId] ? 1 : 0);
      global.__coverage__[filePaths[i]].f[funcId] = 0;
    }

    // Flatten and reset branches
    const branches = fileData.b;
    const branchIds = Object.keys(branches);
    const branchIdsLength = branchIds.length;
    for (let j = 0; j < branchIdsLength; j++) {
      const branchId = branchIds[j];
      const branchHits = branches[branchId];
      const branchHitsLength = branchHits.length;
      for (let k = 0; k < branchHitsLength; k++) {
        flat.set('b_' + branchId + '_' + k, branchHits[k] ? 1 : 0);
        global.__coverage__[filePaths[i]].b[branchId][k] = 0;
      }
    }
  }
  return flat;
}

// After all hooks coverage is filled with dummy functions (exports and so on)
// We don't want to count these as coverage
// So we reset the coverage
const _ = report_and_reset_coverage();

async function executeBytecodeBase64(
  avmBytecodeBase64: string,
  calldata: (typeof Fr)[],
): Promise<{ reverted: boolean; output: (typeof Fr)[]; revertReason?: string }> {
  const bytecode = Buffer.from(avmBytecodeBase64, 'base64');
  const simulator = await getSimulator(calldata);
  const results = await simulator.executeBytecode(bytecode);
  return { reverted: results.reverted, output: results.output, revertReason: results.revertReason };
}

// Execute the AVM bytecode and return the result and the coverage
// @param jsonLine: the JSON line containing the bytecode and the inputs
// prints gzipped result and the coverage to stdout encoded in base64
// @returns void
//
//
// The reason why we gzip the result and the coverage is because the coverage is HUGE and low-entropy
// So printing it to stdout is very slow and we want to avoid that (because we try to maximize the number of executions)
// It turned out that it is faster to gzip and decode it in the fuzzer than to print it to stdout
async function executeFromJson(jsonLine: string): Promise<void> {
  try {
    const input = JSON.parse(jsonLine.trim());
    if ((!input.bytecode || !input.inputs) && !input.restart) {
      writeSync(process.stdout.fd, 'Error: JSON must contain "bytecode" and "inputs" fields or "restart" field\n');
      return;
    }
    if (input.restart) {
      STATE_MANAGER = undefined;
      try {
        await initSimulator();
        if (!STATE_MANAGER) {
          throw new Error('State manager initialization completed but STATE_MANAGER is still undefined');
        }
        const response = { restarted: true };
        const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
        writeSync(process.stdout.fd, output);
      } catch (error: any) {
        const response = { restarted: false, error: error.message };
        const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
        writeSync(process.stdout.fd, output);
      }
      return;
    }
    const calldata = stringArrayToFields(input.inputs);

    let result;
    if (input.ws_data_dir && input.ws_map_size_kb && input.ws_fork_id && input.tx && input.globals) {
      // Use PublicTxSimulator with the existing WorldState database created by C++
      const bytecode = Buffer.from(input.bytecode, 'base64');

      // Decode base64 and deserialize msgpack for tx and globals
      const txBuffer = Buffer.from(input.tx, 'base64');
      const globalsBuffer = Buffer.from(input.globals, 'base64');
      const tx = deserializeFromMessagePack(txBuffer);
      const globals = deserializeFromMessagePack(globalsBuffer);

      // Use the new PublicTxSimulator path with the same fork ID as C++
      result = await simulateWithPublicTxSimulator(
        input.ws_data_dir,
        input.ws_map_size_kb,
        input.ws_fork_id,
        bytecode,
        tx,
        globals,
      );
    } else {
      // Fallback to the default behavior with a temporary WorldState
      result = await executeBytecodeBase64(input.bytecode, calldata);
    }

    const coverage = Object.fromEntries(report_and_reset_coverage());

    const outputLength = result.output.length;
    const outputStrings = new Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      outputStrings[i] = result.output[i].toString();
    }
    const response = {
      reverted: result.reverted,
      output: outputStrings,
      coverage: coverage,
      revertReason: result.revertReason,
    };

    const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
    writeSync(process.stdout.fd, output);
  } catch (error) {
    const coverage = Object.fromEntries(report_and_reset_coverage());
    const response = {
      reverted: true,
      output: [],
      coverage: coverage,
      revertReason: error.message,
    };
    const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
    writeSync(process.stdout.fd, output);
  }
}

// Read json line-by-line from stdin {"bytecode": "...", "inputs": ["1", "2", ...]}
// Process it and print the result of the execution to stdout {"reverted":false,"output":["0x0..."], "coverage":{"s_0":1,"f_0":1,"b_0_0":1,"b_0_1":1...}
async function mainLoop() {
  await initSimulator();
  const rl = createInterface({
    input: process.stdin,
    terminal: false,
  });
  rl.on('line', (line: string) => {
    if (line.trim()) {
      void executeFromJson(line);
    }
  });
  rl.on('close', () => {
    process.exit(0);
  });
}

void mainLoop();

export {};
