var { createInstrumenter } = require('istanbul-lib-instrument');
var { hookRequire } = require('istanbul-lib-hook');
var { gzipSync } = require('zlib');
const INSTRUMENTER = createInstrumenter({ compact: true });

hookRequire(
  (filePath: string): boolean => {
    return true;
  },
  (code: string, { filename }: { filename: string }): string => {
    const newCode = INSTRUMENTER.instrumentSync(code, filename);
    return newCode;
  },
);

var { DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT } = require('@aztec/constants');
var { Fr } = require('@aztec/foundation/fields');
var { AztecAddress } = require('@aztec/stdlib/aztec-address');
var { GlobalVariables } = require('@aztec/stdlib/tx');
var { UInt64 } = require('@aztec/stdlib/types');
var { NativeWorldStateService } = require('@aztec/world-state');

var { createInterface } = require('readline');

var { AvmSimulator } = require('../../public/avm/avm_simulator.js');
var { SimpleContractDataSource } = require('../../public/fixtures/simple_contract_data_source.js');
var { PublicContractsDB, PublicTreesDB } = require('../../public/public_db_sources.js');
var { SideEffectTrace } = require('../../public/side_effect_trace.js');
var { PublicPersistableStateManager } = require('../../public/state_manager/state_manager.js');

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

const DEFAULT_TIMESTAMP: typeof UInt64 = 99833n;

let STATE_MANAGER: typeof PublicPersistableStateManager | undefined;

async function initSimulator() {
  if (STATE_MANAGER) {
    return;
  }
  const contractDataSource = new SimpleContractDataSource();
  const merkleTrees = await (await NativeWorldStateService.tmp()).fork();
  const treesDb = new PublicTreesDB(merkleTrees);
  const contractsDb = new PublicContractsDB(contractDataSource);
  const trace = new SideEffectTrace();
  const firstNullifier = new Fr(420000);
  STATE_MANAGER = PublicPersistableStateManager.create(
    treesDb,
    contractsDb,
    trace,
    /*doMerkleOperations=*/ false,
    firstNullifier,
    DEFAULT_TIMESTAMP,
  );
}

async function getSimulator(calldata: (typeof Fr)[]) {
  await initSimulator();

  const simulator = await AvmSimulator.create(
    STATE_MANAGER!,
    AztecAddress.zero(),
    AztecAddress.zero(),
    new Fr(0),
    GlobalVariables.empty(),
    false,
    calldata,
    { l2Gas: DEFAULT_L2_GAS_LIMIT, daGas: DEFAULT_DA_GAS_LIMIT },
  );
  return simulator;
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
): Promise<{ reverted: boolean; output: (typeof Fr)[] }> {
  const bytecode = Buffer.from(avmBytecodeBase64, 'base64');
  const simulator = await getSimulator(calldata);
  const results = await simulator.executeBytecode(bytecode);
  return { reverted: results.reverted, output: results.output };
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
    if (!input.bytecode || !input.inputs) {
      process.stdout.write('Error: JSON must contain "bytecode" and "inputs" fields\n');
      return;
    }
    const calldata = stringArrayToFields(input.inputs);

    const result = await executeBytecodeBase64(input.bytecode, calldata);

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
    };

    const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
    process.stdout.write(output);
  } catch (error) {
    const coverage = Object.fromEntries(report_and_reset_coverage());
    const response = {
      reverted: true,
      output: [],
      coverage: coverage,
    };
    const output = gzipSync(JSON.stringify(response, null, 0)).toString('base64') + '\n';
    process.stdout.write(output);
  }
}

// Read json line-by-line from stdin {"bytecode": "...", "inputs": ["1", "2", ...]}
// Process it and print the result of the execution to stdout {"reverted":false,"output":["0x0..."], "coverage":{"s_0":1,"f_0":1,"b_0_0":1,"b_0_1":1...}
async function mainLoop() {
  await initSimulator();
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
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
