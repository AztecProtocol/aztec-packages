// acvm_js and noirc_abi as an app has them (js/noir, which withAztec resolves those packages to), over the ACVM
// service's native library: acvm_js's and noirc_abi_wasm's own fixtures give the witnesses and values their wasm
// builds do.
import "../js/index.js";

import * as acvm from "../js/noir/acvm_js.js";
import * as abi from "../js/noir/noirc_abi.js";
import * as addition from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/addition";
import * as complexForeignCall from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/complex_foreign_call";
import * as foreignCall from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/foreign_call";
import * as memoryOp from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/memory_op";
import * as multiScalarMul from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/multi_scalar_mul";
import * as nested from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/nested_acir_call";
import * as compression from "../../../noir/noir-repo/acvm-repo/acvm_js/test/shared/witness_compression";
import * as abiEncode from "../../../noir/noir-repo/tooling/noirc_abi_wasm/test/shared/abi_encode";
import * as decodeError from "../../../noir/noir-repo/tooling/noirc_abi_wasm/test/shared/decode_error";
import { assert, equal, rejects, run, test } from "./harness.js";

const noOracle = () => {
  throw Error("unexpected oracle");
};
const sorted = (witness) => new Map([...witness].sort(([a], [b]) => a - b));

test("executes a circuit", async () => {
  const solved = await acvm.executeCircuit(
    addition.bytecode,
    addition.initialWitnessMap,
    noOracle,
  );
  equal(solved.get(addition.resultWitness), addition.expectedResult, "result");
});

test("answers a foreign call", async () => {
  let seen;
  const solved = await acvm.executeCircuit(
    foreignCall.bytecode,
    foreignCall.initialWitnessMap,
    async (name, inputs) => {
      seen = [name, inputs];
      return foreignCall.oracleResponse;
    },
  );
  equal(
    seen,
    [foreignCall.oracleCallName, foreignCall.oracleCallInputs],
    "oracle call",
  );
  equal(sorted(solved), sorted(foreignCall.expectedWitnessMap), "witness");
});

test("answers a foreign call of arrays", async () => {
  let seen;
  const solved = await acvm.executeCircuit(
    complexForeignCall.bytecode,
    complexForeignCall.initialWitnessMap,
    async (name, inputs) => {
      seen = [name, inputs];
      return complexForeignCall.oracleResponse;
    },
  );
  equal(
    seen,
    [complexForeignCall.oracleCallName, complexForeignCall.oracleCallInputs],
    "oracle call",
  );
  equal(
    sorted(solved),
    sorted(complexForeignCall.expectedWitnessMap),
    "witness",
  );
});

test("runs black boxes and memory", async () => {
  equal(
    sorted(
      await acvm.executeCircuit(
        multiScalarMul.bytecode,
        multiScalarMul.initialWitnessMap,
        noOracle,
      ),
    ),
    sorted(multiScalarMul.expectedWitnessMap),
    "msm",
  );
  equal(
    sorted(
      await acvm.executeCircuit(
        memoryOp.bytecode,
        memoryOp.initialWitnessMap,
        noOracle,
      ),
    ),
    sorted(memoryOp.expectedWitnessMap),
    "memory",
  );
});

test("executions run in parallel, each with its own oracles", async () => {
  const runs = [1, 2, 3].map(async (n) => {
    const solved = await acvm.executeCircuit(
      foreignCall.bytecode,
      foreignCall.initialWitnessMap,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10 * (4 - n)));
        return foreignCall.oracleResponse;
      },
    );
    return sorted(solved);
  });
  for (const solved of await Promise.all(runs)) {
    equal(solved, sorted(foreignCall.expectedWitnessMap), "witness");
  }
});

test("compresses witnesses and stacks as nargo does", () => {
  equal(
    acvm.compressWitness(compression.expectedWitnessMap),
    compression.expectedCompressedWitnessMap,
    "compressed",
  );
  equal(
    sorted(acvm.decompressWitness(compression.expectedCompressedWitnessMap)),
    sorted(compression.expectedWitnessMap),
    "decompressed",
  );
  equal(
    abi.serializeWitness(compression.expectedWitnessMap),
    compression.expectedCompressedWitnessMap,
    "serializeWitness",
  );
  equal(
    acvm.compressWitnessStack(nested.expectedWitnessStack),
    nested.expectedCompressedWitnessStack,
    "stack",
  );
  equal(
    acvm
      .decompressWitnessStack(nested.expectedCompressedWitnessStack)
      .map(({ index, witness }) => [index, sorted(witness)]),
    nested.expectedWitnessStack.map(({ index, witness }) => [
      index,
      sorted(witness),
    ]),
    "decompressed stack",
  );
});

test("a foreign call's error is the cause of the execution's", async () => {
  const oracleError = new Error("oracle failed");
  let caught;
  try {
    await acvm.executeCircuit(
      foreignCall.bytecode,
      foreignCall.initialWitnessMap,
      async () => {
        throw oracleError;
      },
    );
  } catch (e) {
    caught = e;
  }
  equal(caught?.message, "Error awaiting `foreign_call_handler`", "message");
  assert(caught.cause === oracleError, "the cause is the oracle error");
  await rejects(
    () =>
      acvm.executeCircuit(
        foreignCall.bytecode,
        foreignCall.initialWitnessMap,
        () => {
          throw oracleError;
        },
      ),
    /Error calling `foreign_call_callback`/,
    "a handler that throws",
  );
});

test("reports an unsatisfied constraint as an ExecutionError", async () => {
  let caught;
  try {
    await acvm.executeCircuit(
      addition.bytecode,
      new Map([
        [1, "0x01"],
        [2, "0x01"],
        [3, "0x05"],
      ]),
      noOracle,
    );
  } catch (e) {
    caught = e;
  }
  assert(caught, "no error");
  equal(caught.acirFunctionId, 0, "acirFunctionId");
  assert(
    Array.isArray(caught.callStack) && caught.callStack.length > 0,
    "a call stack",
  );
});

test("encodes and decodes by an ABI", () => {
  const witness = abi.abiEncode(abiEncode.abi, abiEncode.inputs);
  const decoded = abi.abiDecode(abiEncode.abi, witness);
  equal(BigInt(decoded.inputs.foo).toString(), abiEncode.inputs.foo, "foo");
  equal(
    decoded.inputs.bar.map((value) => parseInt(value)),
    abiEncode.inputs.bar.map((value) => parseInt(value)),
    "bar",
  );
  equal(decoded.return_value, null, "return value");
});

test("rejects a number JavaScript may have rounded", () => {
  let message = "";
  try {
    abi.abiEncode(abiEncode.abi, { foo: 2 ** 60, bar: ["1", "2", "3"] });
  } catch (e) {
    message = e.message;
  }
  assert(
    /not a safe integer/.test(message),
    `unsafe integer accepted: ${message}`,
  );
});

test("decodes assertion payloads by the error types", () => {
  equal(
    abi.abiDecodeError(decodeError.abi, {
      selector: decodeError.FAKE_STRING_SELECTOR,
      data: [],
    }),
    decodeError.SAMPLE_STRING,
    "a string",
  );
  equal(
    abi.abiDecodeError(decodeError.abi, {
      selector: decodeError.FAKE_FIELD_SELECTOR,
      data: ["0x01"],
    }),
    "0x01",
    "a field",
  );
});

run();
