# S23 / Adreno 740 — WebGPU MSM correctness root-cause analysis

**Status:** hypothesis, ranked by a static audit. **Not yet validated on the
device** — localizing the diverging pass needs the physical Adreno 740 (see
"On-device localization" below). The Galaxy S23 (Adreno 740, Snapdragon 8 Gen 2)
returns a WebGPU MSM commitment that disagrees with the trusted WASM/native path
from n=2¹⁰ up — deterministically — and loses the GPU device at n=2¹⁸. The newer
Adreno in the Galaxy S26 Ultra runs the same shaders correctly, which points at a
**compiler-version-dependent miscompile**, not an algorithm bug.

## What the audit ruled out

- **Subgroup ops.** None exist anywhere in `wgsl/cuzk/*.wgsl`. Not a subgroup-size
  problem.
- **SRS decompress / Montgomery convert** (`decompress_g1_bn254`,
  `convert_points_only`). Every variable shift there is explicitly guarded to
  stay `< 32` (`extract_limb_le`, `limbs_to_le_u32`), so no out-of-range shift
  feeds the point pool. Consistent with the SRS having been ruled out
  empirically (the converted pool is shared and checks out).
- **f32 Montgomery path** (`mont_pro_product_f32_22_sos3uv3`, `bigint_f32`). Bench
  variant only (`shader_manager.ts` header) — not on the production path, so f32
  rounding divergence is not the cause unless a bench knob selects it.
- **Uninitialized workgroup memory in the tiled count transpose**
  (`transpose_count_tiled`). It zeroes its `var<workgroup> hist` with a barrier
  before the first `atomicAdd`, and the zeroing loop `for (s = tid; s < TILE;
  s += WG)` covers all `TILE` cells for any workgroup size. Correct.

## Ranked candidates

### Rank 1 — runtime-variable bit-shift amounts in `read_bits` (strongest)

`read_bits` is duplicated byte-for-byte in **`decompose_scalars_booth`** and
**`bucket_histogram`** — both on the production path at every size — and is the
only remaining hot-path code with **data-dependent shift amounts**:

```wgsl
v = scalars[base + word] >> off;                          // off in [0,31]
v = v | (scalars[base + word + 1u] << (WORD_BITS - off)); // amount in [1,31] (guarded off>=1)
...
return v & ((1u << count) - 1u);                          // count in [1,31]
```

plus `(raw >> c)` and `(1u << c)` (c in [1,15]) in the caller. Every amount is in
valid range, but every amount is a *runtime value*.

This is exactly the class the team already hit and patched once. The sign bit was
moved to a literal bit 31 instead of `neg << c` with this note
(`decompose_scalars_booth.template.wgsl:20`):

> Adreno's WGSL compiler (Galaxy S25, etc.) is unreliable for runtime shift
> amounts — `(neg << c)` where `c` comes from a uniform produces either garbage
> or compile errors.

The sign-pack shift was hardened; **`read_bits` was not.** A newer Adreno
compiler (S26U) folding/lowering these runtime shifts correctly while Adreno
740's older compiler miscompiles them produces precisely the observed signature:
wrong Booth windows → wrong buckets → wrong commitment, deterministically, from
the smallest size.

### Rank 2 — data-dependent codegen in the scan / scatter transpose (weaker)

`transpose_scatter_tiled`, `transpose_parallel_scan`, and `ba_planner_v2_offsets`
also use `var<workgroup>` scratch and per-thread index arithmetic. The count
shader is provably correct; the scatter/scan/planner kernels should be
cross-checked on-device too, but there is no specific smoking gun in them.

## On-device localization (one device, ~minutes)

Run on the S23 with the harness already wired in `dev/msm-webgpu`:

1. `?autorun=msm-cross-check&logn=10&noble=1` — confirms WebGPU is the wrong side
   (vs WASM **and** noble) at the tiniest size.
2. `?debug_smvp=1` / `__msm_debug_dump` — dump intermediate buffers and diff the
   Adreno 740 output against a known-correct device **pass by pass**. The first
   pass that diverges names the culprit:
   - diverges **right after `decompose_scalars_booth`** (the `bucket_and_sign`
     buffer is already wrong) ⇒ Rank 1 confirmed (`read_bits` shifts).
   - `bucket_and_sign` matches but the **CSR/transpose** output diverges ⇒ Rank 2.

## Proposed fix for Rank 1 (apply + validate on the 740, do not ship blind)

Replace the runtime shifts in `read_bits` with a barrel-shifter decomposition
into **constant-amount** shifts, which Tint folds cleanly on every driver:

```wgsl
// Adreno-safe variable shift: s in [0,31], expressed as <=5 constant-amount
// shifts so the Tint backend never emits a runtime shift amount (miscompiled
// on Adreno 7xx). Computes the identical value to `x >> s` on a conformant GPU.
fn shr_var(x: u32, s: u32) -> u32 {
    var r = x;
    if ((s & 16u) != 0u) { r = r >> 16u; }
    if ((s & 8u)  != 0u) { r = r >> 8u; }
    if ((s & 4u)  != 0u) { r = r >> 4u; }
    if ((s & 2u)  != 0u) { r = r >> 2u; }
    if ((s & 1u)  != 0u) { r = r >> 1u; }
    return r;
}
// shl_var is symmetric with `<<`.
```

Then `>> off` → `shr_var(.., off)`, `<< (WORD_BITS - off)` → `shl_var(.., WORD_BITS - off)`,
`(1u << count)` → `shl_var(1u, count)`, `(raw >> c)` → `shr_var(raw, c)`,
`(1u << c)` → `shl_var(1u, c)`.

**Caveats.** (a) This is correctness-preserving on *all* GPUs but adds up to ~5
branches per shift on the hot Booth/histogram path, so it must be applied only
on Adreno-7xx-class devices (or behind the capability gate), never blanket — it
would tax the Mac/S26U paths that are already correct and fast. (b) It is
**unverified** until run on the physical 740: if the pass-level diff in step 2
points at Rank 2 instead, this patch is a no-op and the real fix is elsewhere.

## Safety net regardless of the fix — the capability gate

`cuzk/capability_gate.ts` (added this session, unit-tested) routes any device
whose WebGPU MSM disagrees with WASM — the S23 today — to the WASM path at
runtime. So the S23 never ships a *wrong* proof even before the shader fix
lands; the fix above is the path to making the 740 actually *win* rather than
fall back. See that module and `BENCH` notes for the gate's probe + verdict
model.

---

## On-device findings (2026-06-25, real Adreno 740 / Galaxy S23)

Validated against the physical device using a per-pass buffer-hash diff (S23 vs a
correct reference at an identical `?scalar_seed`, via `?debug_dump=1` →
`MsmV2.dumpDebugHashes`).

**The read_bits barrel-shift fix is CONFIRMED — but S23 has a SECOND, independent bug.**
- After the read_bits fix, `decompose_bucketAndSign` is **bit-exact** vs the Mac
  reference on the 740 (Rank-1 confirmed: the runtime-shift miscompile was real and
  is fixed). The fix is also non-regressing on Metal (Mac cross-check ✅, 3.09× @2^20).
- The MSM is still wrong, because of a second bug **downstream of decompose**.

**Localization of the second bug (all hashes vs Mac, identical seed):**
- `decompose_bucketAndSign` ✅ match · `transpose_partials` ✅ match ·
  `transpose_rowPtr` ✅ match · **`transpose_valIdx` ✗ differs** · `fused_bucketResult` ✗.
- So the transpose **scatter** writes a wrong `val_idx` even though ALL its inputs
  (decompose output, the exclusive-prefix `partials`, the column pointers `rowPtr`)
  are bit-exact, and global writes work correctly in every other pass.
- The wrong `val_idx` differs from the reference even **sorted** (wrong SET, not just a
  reordering), and is **non-deterministic** run-to-run → the 740 also does not reliably
  zero-initialise storage buffers (a WebGPU-spec guarantee).

**Ruled out (none fixed it):** scatter cursor as workgroup-atomic (the original),
workgroup-plain single-threaded, function-local single-threaded, and an
atomic-free O(tile²) re-scan rank; plus explicitly clearing `val_idx` before the
scatter. The scatter inputs are provably correct and the index arithmetic
(`col_ptr[col] + partials[col] + slot`) uses only matching values, yet the written
set is wrong on the 740 — a pathological execution-level bug, not an obvious construct.

**Status:** unresolved after extensive instrumentation. Needs on-device shader-level
debugging (or a from-scratch Adreno-safe transpose). The **capability gate routes
S23 → WASM** so users never see a wrong result meanwhile. Debug scaffold left in place:
`MsmV2.dumpDebugHashes` (gated by `globalThis.__msm_debug_buffers`), the dev-page
`?debug_dump=1` relay, and `?scalar_seed=`. Next probe: hash only the WRITTEN
`val_idx` region (bounded by `rowPtr`) to remove the zero-init confound, and dump the
fused stage's inputs/outputs to confirm whether fused is also implicated.

**FINAL (2026-06-25): the scatter bug is below the shader logic.** Using a
garbage-free, per-window-sorted hash of only the WRITTEN val_idx slots (bounded by
rowPtr — removes the zero-init confound), the written SET is wrong on the 740 for:
the original workgroup-atomic scatter, a single-threaded function-local-cursor
scatter, AND an array-free / atomic-free re-scan scatter (local_slot = a plain
scalar counting earlier same-bucket points). With all scatter inputs proven
bit-exact (decompose, partials, rowPtr), correct index arithmetic, and no
arrays/atomics, a wrong written set means the 740 miscompiles the dispatch at the
control-flow / global-write level — not via any identifiable construct. No
shader-level workaround tried recovers it. Resolution requires vendor-level
investigation or a fundamentally different transpose algorithm; the scatter has
been restored to the original (fast) atomic version. S23 stays gated to WASM.
