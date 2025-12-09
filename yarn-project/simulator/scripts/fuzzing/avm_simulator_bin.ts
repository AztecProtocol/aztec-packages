const { GasFees, Gas, GasSettings } = require('@aztec/stdlib/gas');
const { deserializeFromMessagePack, AvmTxHint } = require('@aztec/stdlib/avm');
const { siloNullifier } = require('@aztec/stdlib/hash');
const { MerkleTreeId } = require('@aztec/stdlib/trees');

// Contract Instance Registry address (same as C++ CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
const CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS = 2;

const { Fr } = require('@aztec/foundation/fields');
const { AztecAddress } = require('@aztec/stdlib/aztec-address');
const { GlobalVariables, Tx, TxHash, HashedValues, TxContext, TxConstantData } = require('@aztec/stdlib/tx');
const { EthAddress } = require('@aztec/foundation/eth-address');
const { NativeWorldStateService } = require('@aztec/world-state');
const {
  PrivateKernelTailCircuitPublicInputs,
  PublicCallRequest,
  PrivateToPublicAccumulatedData,
} = require('@aztec/stdlib/kernel');
const { PartialPrivateTailPublicInputsForPublic } = require('@aztec/stdlib/kernel');
const { padArrayEnd } = require('@aztec/foundation/collection');
const { MAX_ENQUEUED_CALLS_PER_TX } = require('@aztec/constants');
const { ChonkProof } = require('@aztec/stdlib/proofs');

const { createInterface } = require('readline');
const { writeSync } = require('fs');

const { SimpleContractDataSource } = require('../../public/fixtures/simple_contract_data_source.js');
const { PublicContractsDB } = require('../../public/public_db_sources.js');
const { PublicTxSimulator } = require('../../public/public_tx_simulator/public_tx_simulator.js');

// Helper to convert msgpack Buffer objects to Fr
function bufferToFr(value: any): typeof Fr {
  if (!value) return Fr.ZERO;
  if (value.type === 'Buffer' && Array.isArray(value.data)) {
    return Fr.fromBuffer(Buffer.from(value.data));
  }
  if (Buffer.isBuffer(value)) {
    return Fr.fromBuffer(value);
  }
  return new Fr(value);
}

// Helper to convert msgpack Buffer objects to AztecAddress
function bufferToAddress(value: any): typeof AztecAddress {
  if (!value) return AztecAddress.ZERO;
  if (value.type === 'Buffer' && Array.isArray(value.data)) {
    return AztecAddress.fromBuffer(Buffer.from(value.data));
  }
  if (Buffer.isBuffer(value)) {
    return AztecAddress.fromBuffer(value);
  }
  return new AztecAddress(new Fr(value));
}

/**
 * Creates a TypeScript Tx object from a deserialized C++ Tx (AvmTxHint-like structure).
 * This allows using PublicTxSimulator.simulate() with fuzzer-generated transactions.
 *
 * @param cppTx - Deserialized C++ Tx from msgpack (matches AvmTxHint structure)
 * @returns A TypeScript Tx suitable for PublicTxSimulator
 */
async function createFuzzerTx(cppTx: typeof AvmTxHint): Promise<typeof Tx> {
  // Create TxHash from the C++ tx hash string
  if (!cppTx.hash) {
    throw new Error(`cppTx.hash is undefined. Keys: ${Object.keys(cppTx || {}).join(', ')}`);
  }
  const txHash = TxHash.fromString(cppTx.hash);

  // Build proper PublicCallRequest instances from C++ app logic calls
  const appLogicCallRequests = (cppTx.appLogicEnqueuedCalls || []).map((call: any, index: number) => {
    if (!call || !call.request) {
      throw new Error(`appLogicEnqueuedCalls[${index}] missing request field. call=${JSON.stringify(call)}`);
    }
    const req = call.request;
    return new PublicCallRequest(
      bufferToAddress(req.msgSender),
      bufferToAddress(req.contractAddress),
      req.isStaticCall ?? false,
      bufferToFr(req.calldataHash),
    );
  });

  // Pad to MAX_ENQUEUED_CALLS_PER_TX with empty requests
  const paddedAppLogicCalls = padArrayEnd(appLogicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX);

  // Use empty() for non-revertible (setup calls) - fuzzer doesn't use setup phase
  const nonRevertibleAccumulatedData = PrivateToPublicAccumulatedData.empty();

  // Build revertible accumulated data with proper PublicCallRequest instances
  const emptyAccumulated = PrivateToPublicAccumulatedData.empty();
  const revertibleAccumulatedData = new PrivateToPublicAccumulatedData(
    emptyAccumulated.noteHashes,
    emptyAccumulated.nullifiers,
    emptyAccumulated.l2ToL1Msgs,
    emptyAccumulated.privateLogs,
    emptyAccumulated.contractClassLogsHashes,
    paddedAppLogicCalls,
  );

  // Build teardown call request (if exists)
  const teardownCallRequest = cppTx.teardownEnqueuedCall
    ? new PublicCallRequest(
        bufferToAddress(cppTx.teardownEnqueuedCall.request.msgSender),
        bufferToAddress(cppTx.teardownEnqueuedCall.request.contractAddress),
        cppTx.teardownEnqueuedCall.request.isStaticCall ?? false,
        bufferToFr(cppTx.teardownEnqueuedCall.request.calldataHash),
      )
    : PublicCallRequest.empty();

  // Create forPublic structure
  const forPublic = new PartialPrivateTailPublicInputsForPublic(
    nonRevertibleAccumulatedData,
    revertibleAccumulatedData,
    teardownCallRequest,
  );

  // Build GasSettings from C++ tx
  // Note: maxFeesPerGas must be >= global gasFees (which is typically 1 for both da and l2)
  // If C++ provides 0 for maxFeesPerGas, use a default of 1 to match the global fees
  // Note: values may be Fr objects, so we convert to Number first then check for 0
  const DEFAULT_MAX_FEE = 1;
  const toNumberOrDefault = (val: any, defaultVal: number): number => {
    const num = Number(val);
    return num > 0 ? num : defaultVal;
  };
  const gasSettings = new GasSettings(
    new Gas(Number(cppTx.gasSettings.gasLimits.l2Gas), Number(cppTx.gasSettings.gasLimits.daGas)),
    new Gas(
      Number(cppTx.gasSettings.teardownGasLimits?.l2Gas || 0),
      Number(cppTx.gasSettings.teardownGasLimits?.daGas || 0),
    ),
    new GasFees(
      toNumberOrDefault(cppTx.gasSettings.maxFeesPerGas?.feePerDaGas, DEFAULT_MAX_FEE),
      toNumberOrDefault(cppTx.gasSettings.maxFeesPerGas?.feePerL2Gas, DEFAULT_MAX_FEE),
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
    bufferToAddress(cppTx.feePayer),
    0n, // includeByTimestamp
    forPublic,
    undefined, // forRollup - not needed for public simulation
  );

  // Build publicFunctionCalldata from all enqueued calls
  // Convert Buffer objects in calldata to Fr values
  const convertCalldata = (calldata: any[]): (typeof Fr)[] => (calldata || []).map(bufferToFr);

  const publicFunctionCalldata: (typeof HashedValues)[] = [];

  // Add setup calls
  for (const call of cppTx.setupEnqueuedCalls || []) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(convertCalldata(call.calldata)));
  }

  // Add app logic calls
  for (const call of cppTx.appLogicEnqueuedCalls || []) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(convertCalldata(call.calldata)));
  }

  // Add teardown call if present
  if (cppTx.teardownEnqueuedCall) {
    publicFunctionCalldata.push(await HashedValues.fromCalldata(convertCalldata(cppTx.teardownEnqueuedCall.calldata)));
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

/**
 * Execute a transaction using PublicTxSimulator.
 * This is the full transaction simulation path that matches the C++ AVM simulator.
 *
 * @param dataDir - World state data directory
 * @param mapSizeKb - World state map size in KB
 * @param bytecode - AVM bytecode to execute
 * @param cppTx - Deserialized C++ Tx from msgpack
 * @param cppGlobals - Deserialized C++ GlobalVariables from msgpack
 * @returns Simulation result with reverted status and output
 */
async function simulateWithPublicTxSimulator(
  dataDir: string,
  mapSizeKb: number,
  bytecode: Buffer,
  cppTx: typeof AvmTxHint,
  cppGlobals: typeof GlobalVariables,
): Promise<{ reverted: boolean; output: (typeof Fr)[]; revertReason?: string }> {
  // Open the existing WorldState database created by C++
  const worldStateService = await openExistingWorldState(dataDir, mapSizeKb);
  const merkleTrees = await worldStateService.fork();

  // TODO: This only works while we have a single app logic call
  // Get contract address from the app logic call
  const appLogicCall = cppTx.appLogicEnqueuedCalls[0];
  const contractAddress = bufferToAddress(appLogicCall.request.contractAddress);

  // Insert contract address nullifier into the nullifier tree
  // This makes the contract "deployed" from the perspective of the state manager
  const contractAddressNullifier = await siloNullifier(
    AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
    contractAddress.toField(),
  );
  await merkleTrees.sequentialInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()]);

  // Create contract data source and register bytecode
  const contractDataSource = new SimpleContractDataSource();
  // Register the bytecode at the contract address
  await contractDataSource.addContractWithBytecode(contractAddress, bytecode);

  // Create the contracts DB
  const contractsDb = new PublicContractsDB(contractDataSource);

  // Build GlobalVariables from deserialized msgpack data
  // Convert gasFees from plain object to proper GasFees instance with BigInt values
  const globalVariables = {
    ...cppGlobals,
    gasFees: new GasFees(Number(cppGlobals.gasFees?.feePerDaGas || 1), Number(cppGlobals.gasFees?.feePerL2Gas || 1)),
  };

  // Create the PublicTxSimulator
  const config = {
    skipFeeEnforcement: true,
  };
  const publicTxSimulator = new PublicTxSimulator(merkleTrees, contractsDb, globalVariables, config);

  // Create a TypeScript Tx from the C++ Tx
  const tx = await createFuzzerTx(cppTx);

  // Simulate the transaction
  const result = await publicTxSimulator.simulate(tx);

  // Extract output from appLogicReturnValues
  const output: (typeof Fr)[] = [];
  if (result.appLogicReturnValues) {
    for (const returnValues of result.appLogicReturnValues) {
      if (returnValues && returnValues.values) {
        for (const value of returnValues.values) {
          if (value !== undefined && value !== null) {
            output.push(value);
          }
        }
      }
    }
  }

  const reverted = !result.revertCode.isOK();
  const revertReason = result.revertReason?.message;

  return { reverted, output, revertReason };
}

// Execute the AVM bytecode and return the result
// @param jsonLine: the JSON line containing the bytecode, tx, globals, and world state info
// prints result to stdout as JSON
async function executeFromJson(jsonLine: string): Promise<void> {
  try {
    const input = JSON.parse(jsonLine.trim());
    if (!input.bytecode || !input.ws_data_dir || !input.ws_map_size_kb || !input.tx || !input.globals) {
      writeSync(
        process.stdout.fd,
        'Error: JSON must contain "bytecode", "ws_data_dir", "ws_map_size_kb", "tx", and "globals" fields\n',
      );
      return;
    }

    const bytecode = Buffer.from(input.bytecode, 'base64');

    // Decode base64 and deserialize msgpack for tx and globals
    const txBuffer = Buffer.from(input.tx, 'base64');
    const globalsBuffer = Buffer.from(input.globals, 'base64');
    const tx = deserializeFromMessagePack(txBuffer);
    const globals = deserializeFromMessagePack(globalsBuffer);

    const result = await simulateWithPublicTxSimulator(input.ws_data_dir, input.ws_map_size_kb, bytecode, tx, globals);

    const outputLength = result.output ? result.output.length : 0;
    const outputStrings = new Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const outputValue = result.output[i];
      outputStrings[i] = outputValue != null ? outputValue.toString() : '0';
    }
    const response = {
      reverted: result.reverted,
      output: outputStrings,
      revertReason: result.revertReason,
    };

    writeSync(process.stdout.fd, JSON.stringify(response) + '\n');
  } catch (error: any) {
    const response = {
      reverted: true,
      output: [],
      revertReason: error.message,
    };
    writeSync(process.stdout.fd, JSON.stringify(response) + '\n');
  }
}

// Read json line-by-line from stdin
// Process it and print the result of the execution to stdout
async function mainLoop() {
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
