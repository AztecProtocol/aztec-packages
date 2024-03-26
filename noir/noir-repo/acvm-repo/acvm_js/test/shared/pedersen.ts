// See `pedersen_circuit` integration test in `acir/tests/test_program_serialization.rs`.
export const bytecode = Uint8Array.from([31, 139, 8, 0, 0, 0, 0, 0, 0, 255, 93, 74, 133, 9, 0, 0, 8, 179, 240, 255, 139, 197, 6, 113, 48, 150, 8, 13, 9, 226, 248, 84, 125, 217, 198, 83, 144, 79, 127, 117, 247, 255, 43, 56, 71, 252, 254, 8, 105, 0, 0, 0]
);

export const initialWitnessMap = new Map([[1, '0x0000000000000000000000000000000000000000000000000000000000000001']]);

export const expectedWitnessMap = new Map([
  [1, '0x0000000000000000000000000000000000000000000000000000000000000001'],
  [2, '0x083e7911d835097629f0067531fc15cafd79a89beecb39903f69572c636f4a5a'],
  [3, '0x1a7f5efaad7f315c25a918f30cc8d7333fccab7ad7c90f14de81bcc528f9935d'],
]);
