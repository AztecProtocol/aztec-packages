// CPU reference SMVP — used in tal-webgpu only inside `log_result === true`
// debug blocks. The bb.js port runs with log_result=false on the production
// path, so this is dead code. Kept as a stub so submission.ts imports
// continue to resolve without dragging in the BLS12-377 typed
// reference implementation.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cpu_smvp_signed = (..._args: unknown[]): any => {
  throw new Error(
    "cpu_smvp_signed is stubbed out in the bb.js port — set log_result=false",
  );
};
