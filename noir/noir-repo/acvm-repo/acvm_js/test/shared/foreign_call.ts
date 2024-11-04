import { WitnessMap } from '@noir-lang/acvm_js';

// See `simple_brillig_foreign_call` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 173, 79, 73, 10, 128, 48, 12, 236, 40, 46, 5, 111, 126, 36, 254, 192, 207, 120,
  240, 226, 65, 196, 247, 91, 48, 129, 80, 186, 28, 154, 129, 144, 201, 132, 44, 3, 247, 99, 14, 1, 230, 3, 103, 169,
  53, 68, 219, 57, 83, 27, 54, 216, 237, 34, 253, 111, 23, 19, 104, 177, 96, 76, 204, 251, 68, 191, 55, 52, 238, 163,
  187, 198, 251, 105, 114, 101, 200, 221, 37, 196, 200, 252, 188, 222, 227, 126, 80, 153, 200, 213, 57, 125, 77, 244,
  62, 112, 171, 6, 33, 119, 2, 0, 0,
]);
export const initialWitnessMap: WitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000005'],
]);

export const oracleCallName = 'invert';
export const oracleCallInputs = [['0x0000000000000000000000000000000000000000000000000000000000000005']];

export const oracleResponse = ['0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d06e7f3fbd4c6666667'];

export const expectedWitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000005'],
  [2, '0x135b52945a13d9aa49b9b57c33cd568ba9ae5ce9ca4a2d06e7f3fbd4c6666667'],
]);
