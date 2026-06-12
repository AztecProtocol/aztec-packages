# Handoff: fast-compile EC complete-add (`vmpack`) + W=2 cooperative inverse

Two BN254 (base field Fq, 20×13-bit Montgomery) WebGPU algorithms, self-contained.
Apply the patch from your repo root; everything lands under
`barretenberg/ts/dev/msm-webgpu/`. WGSL is loaded verbatim via `?raw` (no build
step / no `shaders.ts` regen — these are dev experiments, not `src/` templates).

## Files

| file | what | entry points | validated |
|---|---|---|---|
| `ec_vmpack.wgsl` | complete RCB projective add (a=0, b3=9), microcoded + packed register file | `add_main` / `dbl_main` / `madd_main` | 64/64 vs noble (incl. P==Q) |
| `coop2_inverse.wgsl` | W=2 cooperative safegcd modular inverse (control-replicated + matrix-split) | `coop2_inv_main` | 512/512 vs bigint modinv |
| `coop2sg_inverse.wgsl` | W=2 cooperative inverse, subgroup-pipeline variant | `coop2sg_inv_main` | 512/512 vs bigint modinv |
| `ec_handoff_check.ts` + `ec_handoff.html` | self-contained validator (imports only the 3 wgsl + `@noble/curves`) | — | — |

## Validate

Serve `barretenberg/ts/` with vite and open
`/dev/msm-webgpu/ec_handoff.html` in a WebGPU browser (Chrome). Expect:
`inverse coop2 512/512`, `inverse coop2sg 512/512`, `vmpack add/dbl/madd 64/64`,
then `[bench] DONE`. Headless: `node dev/msm-webgpu/drive-persist.mjs <url>` (or any
playwright driver that waits for `[bench] DONE`).

## 1. `vmpack` — the point of this handoff is COLD COMPILE on Mali

Problem it solves: the obvious inlined EC kernel cold-compiles in **~4.9 s on
Mali-G715** (Pixel 9a) because the driver inlines the montmul at all 16 call sites
into a ~6400-line program (at chain>1 it overflows `llvm::ScalarEvolution` and
crashes the GPU process). `vmpack` cold-compiles in **~600 ms (≈8× faster) and
executes FASTER than the inlined version** (add 2.4 ms vs 3.6 ms on the same
phone), correct, one algorithm, no device toggle. On M2 it matches the inlined
add (~5.8 ms); the complete formula also does dbl/madd at add-cost.

Two ideas, both required:
1. **Microcode the formula.** The complete add is const index tables
   (`VOP/VA/VB/VO`) driving a step loop that dispatches montmul/fr_add/fr_sub/
   nine/three. The montmul is written ONCE and called from the loop → the driver
   keeps a single body (can't inline it 16×) → ~8× smaller program → fast compile;
   Metal keeps it one function (no crash). The montmul body itself stays UNROLLED
   (named accumulator) so per-op speed is unchanged.
2. **Pack the register file 2×13-bit per u32** (10 u32/slot, not 20). The VM's
   `v[]` is dynamically indexed, so the compiler can't prove liveness and spills
   every slot; that spill traffic was the only exec cost. Packing halves it — and
   the packed file is now LESS traffic than the inlined version's unpacked spilled
   intermediates, so exec comes out faster. montmul unpacks operands / packs result.

I/O (homogeneous projective X:Y:Z, Montgomery, R=2^260): per op-thread, input is
X1,Y1,Z1[,X2,Y2,Z2] as 20-limb blocks (add stride 120, madd 100 with Z2≡1, dbl
60); output is X3,Y3,Z3 (stride 60). 1 thread per op. `madd` bakes Z2=MONT_ONE.
The formula is COMPLETE (RCB): `add` also doubles (feed P==Q) and handles the
identity, so an MSM bucket loop can use one exception-free op for everything.

## 2. W=2 cooperative safegcd inverse

A subgroup lane-PAIR (`role = sgid & 1`) cooperates on ONE modular inverse, halving
per-thread inverse state vs the scalar version — for register-starved GPUs (Mali/
Adreno) where the scalar safegcd inverse is the occupancy bottleneck. Bernstein-Yang
safegcd; `e_init = R²` so the result comes out without a final Montgomery multiply.
I/O: input/output are each 20 limbs (the value to invert / its inverse mod p),
2 lanes per inverse, dispatch `ceil(ops*2/64)` workgroups. Output is 1-bit-redundant
(skewed, limbs ≤2^14) — mask `&0x1fff` per limb then reduce mod p when reading.
Two variants: `coop2_inverse` (control-replicated + matrix-split divsteps) and
`coop2sg_inverse` (subgroup-pipeline: SG roles split divsteps vs apply). `coop2sg`
assumes subgroup size ≥… (validated on size-32 Apple/Mali Tint frontend); both need
the `subgroups` feature + `CHAIN_K` override (`coop2sg` also a `DBG` override = 0).

## Dead-ends — do NOT re-try (each cost real time this session)

- **Rolled montmul inlined in the formula CRASHES Metal** (XPC_ERROR) — every form
  tried (override bound, opaque-runtime bound, self-contained named-scalar loop,
  t[]-array). Metal can't take a rolled montmul inlined 16×. The montmul must be
  either fully unrolled+inlined (slow Mali compile) OR called-once-from-a-loop
  (the vmpack VM). There is no third option.
- **Fully loop-free (unroll everything) is the WORST Mali compile (~11.6 s)** —
  program SIZE, not loops, is what the driver chokes on.
- **Unpacked VM** (register file 20 u32/slot): fast compile (0.8 s) but exec ~2×
  (spill). Packing is what fixes it — don't ship the unpacked VM.
- **Fused-sop VM** (sop2 = a·b+c·d ops): worse on both (4-operand dispatch reads
  more from the register file).
- **Workgroup memory for the register file**: no win on Valhall (same memory
  hierarchy as private spill) and it forces a small workgroup_size.
- **Cooperative complete-add EC (coop2 VROOM)** exists and is correct but is NOT in
  this bundle (operator scoped this handoff to vmpack + the inverse).

## Measurement gotchas (Mali / Pixel 9a)

- Shader-cache cold compile: a comment-based cache-bust does NOT force cold (Tint
  strips comments → identical SPIR-V → driver cache hit). The only reliable cold
  number is a shader's FIRST-EVER compile on the device.
- `pm clear com.android.chrome` resets Chrome to FirstRunActivity (page never
  loads); needs `--no-first-run --disable-fre` in
  `/data/local/tmp/chrome-command-line` alongside the WebGPU flags.
- The phone throttles hard across a session — compare interleaved/same-thermal and
  trust the ratio, not absolute ms.
