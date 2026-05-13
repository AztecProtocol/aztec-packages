// CPU reference transpose — used in tal-webgpu only inside `log_result === true`
// debug blocks. Stubbed out in the bb.js port. See ./smvp.ts for context.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cpu_transpose = (..._args: unknown[]): any => {
  throw new Error(
    "cpu_transpose is stubbed out in the bb.js port — set log_result=false",
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const cpu_transpose_classic = (..._args: unknown[]): any => {
  throw new Error(
    "cpu_transpose_classic is stubbed out in the bb.js port — set log_result=false",
  );
};
