// See `pedersen_circuit` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([
  31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 93, 74, 9, 10, 0, 0, 4, 115, 229, 255, 47, 22, 66, 97, 181, 118, 34, 20, 36, 136,
  237, 83, 245, 101, 107, 79, 65, 94, 253, 214, 217, 255, 239, 192, 1, 152, 119, 76, 250, 113, 0, 0, 0,
]);

export const initialWitnessMap = new Map([[1, '0x0000000000000000000000000000000000000000000000000000000000000001']]);

export const expectedWitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000001'],
  [2, '0x083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5a'],
  [3, '0x1a7f5efaad7f315c25a918f30cc8d7333fccab7ad7c90f14de81bcc528f9935d'],
]);
