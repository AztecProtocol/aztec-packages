# MsmV2 Algorithm Reference

Per-kernel reference card. For each WGSL pass: bind group, dispatch
shape, template parameters, I/O layout, math summary. The narrative
walk-through (worked examples, motivation, cross-stage rationale)
lives in [FLOW.md](FLOW.md) — sections here cross-link to it.

[MSM_DESIGN_ANALYSIS.md](../MSM_DESIGN_ANALYSIS.md) (parent directory)
describes the removed cuZK pipeline and is *not* a reference for MsmV2 —
it remains a useful primer for *Pippenger* and for the WASM-MT side, but
Sections 4+ no longer match the tree.

**Conventions used in the bind-group tables.**

- *Mode*: WGSL storage qualifier — `read`, `read_write`, `uniform`.
- *Layout* uses `vec4<u32>` for the 8-u32-packed field form (two vec4 ≡
  one 256-bit element), `u32` for index / sign / count buffers,
  `vec4<u32>` for the 4-word `params` uniform.
- *2-plane SoA*: a single buffer holding plane 0 ($x$) for all $M$
  elements, then plane 1 ($y$). Plane $p$ base at $p \cdot 2 \cdot M$
  vec4-units, element $e$ on plane $p$ at $p \cdot 2M + 2e$. Used by
  `active_sums`, `bucket_result`, `red_buf`.
- Template parameter style follows Mustache: `{{ name }}` is a scalar
  substitution, `{{#flag}}…{{/flag}}` a conditional include.

---

## 0. Top-level shape

MsmV2 is a three-phase host API plus a single GPU pipeline:

- `MsmV2Pool.create(device, srsCanonicalBytes)` — upload + GPU-convert
  the SRS to Montgomery 8×u32 form *once* (§1). Subsequent MSMs bind a
  prefix of this pool, optionally with `srs_offset`.
- `MsmV2.create(device, n, pool, config?)` — data-independent: compile
  pipelines + bind groups for an $n$-point MSM, binding a prefix of
  `pool`.
- `MsmV2.prepare(scalarsBuf)` — *untimed*: host Booth decode → per-level
  plan → (re)allocate the data-dependent buffers + bind groups. Cached
  by identity ([msm_v2.ts:15-16](../msm_v2.ts#L15-L16)).
- `MsmV2.encodeIntoBatch(enc, …)` — *timed*: encode every dispatch into
  a shared command encoder, await `mapAsync`, decode the result buffer,
  hand the per-window sums back to native `combine_windows` (§6).

Pipeline order, per MSM ([msm_v2.ts:2115-2152](../msm_v2.ts#L2115-L2152)):

```
decompose_scalars_booth       §2
xpose_count_tiled             ┐
xpose_reduce_tiled            │ §3
xpose_parallel_scan           │
xpose_scatter_tiled           ┘
csr_to_v2_active_sums         ┐ §4.1 (layout)
csr_to_v2_meta                ┘
For each pair-tree level lv = 0..levels-1:
  ba_planner_v2_offsets       ┐
  ba_planner_v2_emit          │ §4.2
  ba_fused_super_bench  ×tiles│ §4.3
  ba_carry_copy_bench         │
  ba_finalize_copy_bench      ┘
ba_reduce_init_bench          ┐ §5
ba_reduce_level_bench × passes┘
[copy per-window sums into staging]   → §6 (native fold)
```

Window batching (Lever G) wraps the whole sequence in an outer batch
loop; each batch handles a contiguous range of windows so the
intermediate buffers can be sized for one batch's worth of windows
instead of all $T$.

---

## 1. SRS pool — `convert_points_only`

[wgsl/cuzk/convert_points_only.template.wgsl](../wgsl/cuzk/convert_points_only.template.wgsl)
| Host: [`MsmV2Pool.create` at msm_v2.ts:848-934](../msm_v2.ts#L848-L934)
| Narrative: [FLOW.md §2](FLOW.md#2-one-time-setup--uploading-the-srs)

**Math.** Each thread reads one canonical-LE affine point
$(x_i, y_i) \in \mathbb{F}_q^2$ and writes its Montgomery form to two
output planes:

$$
\tilde x_i = x_i \cdot R \bmod q,
\qquad
\tilde y_i = y_i \cdot R \bmod q,
\qquad
R = 2^{256} \bmod q.
$$

Both products use the 20×13 schoolbook multiply with Barrett reduction.
Field code is shared with the per-MSM kernels — same arithmetic, no
custom path for the one-shot conversion.

**Bind group.**

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `first_half` | read | `array<u32>` | First $\lfloor \text{srsN}/2 \rfloor$ points, canonical LE |
| 1 | `second_half` | read | `array<u32>` | Remaining $\lceil \text{srsN}/2 \rceil$ points |
| 2 | `point_x` | read_write | `array<vec4<u32>>` (packed) | Plane 0 of pool — $\tilde x_i$ |
| 3 | `point_y` | read_write | `array<vec4<u32>>` (packed) | Plane 1 of pool — $\tilde y_i$ |
| 4 | `input_size` | uniform | u32 | `srsN` |

The input is split into two storage buffers because WebGPU's per-binding
storage-buffer cap is 128 MiB on most adapters. Output is laid out as
two separate buffers (`poolX`, `poolY`) of $\text{srsN} \times 32$
bytes each — distinct from the per-MSM 2-plane-SoA single buffers used
later in the pipeline.

**Dispatch.** `dispatchWorkgroups(numXWorkgroups, numYWorkgroups, 1)`,
each thread handling one point. Host picks `(workgroup_size,
numXWorkgroups)` from a tier table ([msm_v2.ts:887-898](../msm_v2.ts#L887-L898)):

| srsN range | `workgroup_size` | `numXWorkgroups` |
|---|---|---|
| ≤ 256 | 256 | 1 |
| ≤ 32 768 | 64 | 4 |
| ≤ 131 072 | 256 | 8 |
| > 131 072 | 256 | 32 |

`numYWorkgroups = ceil(srsN / (workgroup_size × numXWorkgroups))`. The
shader's `id >= input_size` guard discards over-dispatched threads, so
non-power-of-two `srsN` (e.g. $88\,899$ for the ECDSA-r1 transfer flow)
is safe.

**Template parameters.**

| Name | Value | Notes |
|---|---|---|
| `workgroup_size` | per tier table above | Compiled in. |
| `num_y_workgroups` | per dispatch | Used for the `id = gidx * num_y_workgroups + gidy` flat index. |
| `packed` | `true` | Selects the 8×u32 (`vec4<u32>` ×2) packed output layout. |
| `num_16_bit_words_per_coord` / `coord_u32_words` | 16 / 8 | Coord byte ↔ limb wiring. |
| `r_limbs` | constant emit | The 20×13 limb digits of $R$. |

**Adaptive doubling.** `MsmV2Pool.create` is called for the published
prefix, not necessarily the full SRS. If a later batch needs more, the
C++ dispatcher walks the batch, computes $\max_i (\text{srs\_offset}_i +
n_i)$, and doubles the published prefix until it covers that bound
([webgpu_msm_hook.cpp:147-183](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp#L147-L183)).
A session that reaches the SRS top pays $O(\log N)$ re-uploads, not
one per MSM.

**Prefix addressing.** A polynomial that commits to a sub-prefix of the
SRS passes its `srs_offset` (point index, not byte) across the bridge.
The offset is baked into `active_sums` at the level-0 boundary
([csr_to_v2_active_sums:36-40](../wgsl/cuzk/csr_to_v2_active_sums.template.wgsl#L36-L40)),
so a single uploaded pool serves every commit; see §4.1.

---

## 2. Carry-free Booth — `decompose_scalars_booth`

[wgsl/cuzk/decompose_scalars_booth.template.wgsl](../wgsl/cuzk/decompose_scalars_booth.template.wgsl)
| Host: `boothDigit` at [msm_v2.ts:159](../msm_v2.ts#L159) (mirrors the GPU path)
| Narrative: [FLOW.md §5](FLOW.md#5-stage-1--carry-free-booth-decompose) (full derivation + worked example)

**Math.** Per `(window j, point i)`, the signed digit $s_{i,j}$ is a
pure function of $c+1$ bits of $s_i$ — window $j$'s $c$ bits plus the
top bit of the window immediately below ($0$ for $j = 0$).

$$
\text{winBits} = \lfloor s_i / 2^{jc} \rfloor \bmod 2^c,
\qquad
\text{raw} = (\text{winBits} \ll 1) \,\vert\, \text{lookback}.
$$

$$
\text{neg} = (\text{raw} \gg c) \,\&\, 1,
\qquad
\text{bucket} = ((\text{encode} - \text{neg}) \oplus \text{negMask}) \,\&\, (2^c - 1),
$$

where $\text{encode} = (\text{raw} + 1) \gg 1$ and $\text{negMask} =
0 - \text{neg}$. Range: $\text{bucket} \in [0, 2^{c-1}]$ (zero bucket
included), $s_{i,j} \in [-2^{c-1}, +2^{c-1}]$.

**Carry-freeness** comes from reading the lookback bit *directly off
the scalar* (bit $jc-1$) rather than from window $j-1$'s carry — every
`(j, i)` digit is independent, hence one thread per pair.

**Bind group.**

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `scalars` | read | `array<u32>` | $n$ scalars, canonical LE, 32 bytes (= 8 u32) each |
| 1 | `bucket_and_sign` | read_write | `array<u32>` | Output: $T \times n$ entries (window-major) |
| 2 | `params` | uniform | `vec4<u32>` | $(n,\, T_\text{batch},\, c,\, \text{scalar\_words})$ |
| 3 | `batch` | uniform | `vec4<u32>` | $(\text{batch\_window\_base},\, …)$ — Lever G window batching |

**Output packing.** Each entry is one u32: bits $[0, c-1]$ hold the
bucket, bit $31$ holds the sign. Sign at bit 31 (a literal) rather than
bit $c$ (a uniform) is an Adreno workaround — Tint folds the constant
shift cleanly on every driver. Halves the working-set bytes vs. two
parallel u32 arrays; at $n = 131\,071$ this is ~10 MB saved.

**Dispatch.** `dispatchWorkgroups(ceil(n / workgroup_size),
batchWindows, 1)`. One thread per `(point, window-in-batch)`. Threads
past $n$ or past `num_windows` no-op via the entry guard.

**Template parameters.**

| Name | Notes |
|---|---|
| `workgroup_size` | Compiled in; constant shift folds cleanly. |

`scalars` must be in canonical (non-Montgomery) form. The transpose
phase (§3) reads the bucket as `entry & 0x7FFFFFFFu`; the
`csr_to_v2_active_sums` gather (§4.1) reads the sign as `entry >> 31u`.

---

## 3. Tiled counting-sort transpose

Four GPU dispatches turn the *point-major* `bucket_and_sign` table into
the *bucket-major* CSC view that Stage 4 reads. See [FLOW.md §6](FLOW.md#6-stage-2--tiled-counting-sort-transpose)
for motivation, the privatization-+-tiling rationale, and a worked
example. Layout summary:

$$
N_j[k] = \lvert\{ i : \text{bucket}_{i,j} = k \}\rvert,
\quad
\text{colPtr}_j[k] = \sum_{\ell < k} N_j[\ell],
\quad
\text{valIdxs}_j[s] = i \;\text{for}\; s \in [\text{colPtr}_j[k], \text{colPtr}_j[k+1]).
$$

Driven from [msm_v2.ts:2120-2123](../msm_v2.ts#L2120-L2123).

### 3.1 `xpose_count_tiled`

[wgsl/cuzk/transpose_count_tiled.template.wgsl](../wgsl/cuzk/transpose_count_tiled.template.wgsl).
Histograms each point tile's column indices into a workgroup-shared
histogram, writes a partial-histogram row to `partials`.

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `bucket_and_sign` | read | `array<u32>` | §2 output |
| 1 | `partials` | read_write | `array<u32>` | $[\text{window}][\text{point\_tile}][\text{bucket}]$, stride $\text{numPointTiles} \cdot B_W$ |
| 2 | `params` | uniform | `vec4<u32>` | $(\text{numPointTiles},\, B_W,\, n,\, \text{pointsPerTile})$ |

- Dispatch: `(numPointTiles, batchWindows, 1)`. One workgroup per
  `(point_tile, window-in-batch)`. With Lever G off, `batchWindows = T`.
- Workgroup-shared: `array<atomic<u32>, TILE>`. `TILE = min(B_W, 8192)`.
  For $c \le 13$ this is one sub-tile; $c = 15$ triggers a second
  sub-tile loop covering $\lceil B_W / \text{TILE} \rceil$ bucket
  sub-windows, re-scanning the point tile per sub-tile.
- Sign bit (bit 31) is masked out via `& 0x7FFFFFFFu`. Only the bucket
  index addresses the histogram.

Template params: `workgroup_size`, `tile`.

### 3.2 `xpose_reduce_tiled`

[wgsl/cuzk/transpose_reduce_tiled.template.wgsl](../wgsl/cuzk/transpose_reduce_tiled.template.wgsl).
Per `(window, bucket)`, sums the per-tile counts into the window's
column count and rewrites `partials` in-place as the point-tile-exclusive
prefix (lets §3.4 compute slot in constant time, no global atomic).

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `partials` | read_write | `array<u32>` | Read per-tile, written to exclusive-prefix |
| 1 | `all_csc_col_ptr` | read_write | `array<u32>` | Window's column counts: writes slot $k+1$ |
| 2 | `params` | uniform | `vec4<u32>` | $(\text{numPointTiles},\, B_W)$ |

- Dispatch: `(ceil(B_W / workgroup_size), batchWindows, 1)`. One thread per
  `(window-in-batch, bucket)` pair.
- Slot 0 of each window's `all_csc_col_ptr` row stays at 0
  (host-zeroed); §3.3 turns the per-column counts into the exclusive
  prefix.
- No atomics — each thread owns a disjoint bucket column of `partials`.

### 3.3 `xpose_parallel_scan`

[wgsl/cuzk/transpose_parallel_scan.template.wgsl](../wgsl/cuzk/transpose_parallel_scan.template.wgsl).
Per-window in-place 3-phase chunked scan ($n+1$ entries):
(A) per-thread chunk-sum into shared `wg_sums`,
(B) Hillis–Steele inclusive scan over the 256 thread-sums,
(C) per-thread in-place inclusive-prefix write into the row.

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `all_csc_col_ptr` | read_write | `array<atomic<u32>>` | Per-window $(B_W + 1)$-entry row |
| 1 | `params` | uniform | `vec3<u32>` | $(\,?\,,\, B_W,\, \,?\,)$ |

- Dispatch: `(batchWindows, 1, 1)`. **One workgroup per window**, fixed
  at `workgroup_size = 256`.
- `atomic` qualifier is to satisfy WGSL's aliasing rules for in-place
  shared reads/writes within a workgroup; there is no inter-workgroup
  contention.
- Replaces a prior 37-ms serial-per-subtask scan; expected ~1–2 ms with
  workgroup parallelism (see header comment).

### 3.4 `xpose_scatter_tiled`

[wgsl/cuzk/transpose_scatter_tiled.template.wgsl](../wgsl/cuzk/transpose_scatter_tiled.template.wgsl).
Re-scans each point tile and scatters point indices into
`all_csc_val_idxs` at

$$
\text{slot} = \underbrace{\text{colPtr}[(j, k)]}_{\text{window-global bucket start}}
+ \underbrace{\text{partials}[(j, t, k)]}_{\text{point-tile-exclusive offset}}
+ \underbrace{\text{curr}[k]}_{\text{within-tile cursor}}.
$$

The within-tile cursor `curr[k]` lives in workgroup-shared memory; the
only atomics in this kernel are workgroup-shared, contention bounded by
tile size.

| @binding | Name | Mode | Layout | Role |
|---|---|---|---|---|
| 0 | `bucket_and_sign` | read | `array<u32>` | §2 output (sign masked off) |
| 1 | `all_csc_col_ptr` | read | `array<u32>` | §3.3 output |
| 2 | `partials` | read | `array<u32>` | §3.2 output |
| 3 | `all_csc_val_idxs` | read_write | `array<u32>` | Output — bucket-major point indices |
| 4 | `params` | uniform | `vec4<u32>` | Same as §3.1 |

- Dispatch: `(numPointTiles, batchWindows, 1)`. Mirrors §3.1.
- Sub-tile loop if `n_cols > TILE`. Each slot in `all_csc_val_idxs` is
  written exactly once.

Template params for §3.1, §3.2, §3.4: `workgroup_size`, and §3.1/§3.4
also have `tile`.

---

## 4. Pair-tree bucket accumulate

For each bucket $(j, k)$ with $N_{j,k}$ entries, build $B_{j,k} =
\sum P_i$ by tree reduction. Each level halves $N_{j,k}$ via batched
affine addition with one shared inversion per `pair_block` of $S$
pairs. Narrative + the bucket-count recurrence $N \to \lceil N/2
\rceil$ are in [FLOW.md §8](FLOW.md#8-stage-4--pair-tree-bucket-accumulate);
this section covers the seven kernels feeding it.

The fused kernels (`ba_fused_super`, `ba_carry_copy`, `ba_finalize_copy`)
have an `l0_index_mode` switch: at level 0, `active_sums` is a flat
`array<u32>` of `(point_idx | sign << 31)` and the kernel gathers the
actual point from the pool (`point_x`/`point_y`). At level ≥ 1,
`active_sums` is `array<vec4<u32>>` in 2-plane SoA. Both forms compile
to the same kernel template.

### 4.1 `csr_to_v2_active_sums` — bucket-major points buffer

[wgsl/cuzk/csr_to_v2_active_sums.template.wgsl](../wgsl/cuzk/csr_to_v2_active_sums.template.wgsl).
One thread per CSC slot. Reads `pt_idx = val_idx[slot]`, the digit's
sign from `bucket_and_sign`, and writes the slot's point into
`active_sums` (selecting $-y$ via either `new_point_y_neg` or in-loop
field negation when the sign is set).

**Two compile-time variants, `index_mode` flag:**

*Default mode* (level ≥ 1) — materialize the full point.

| @binding | Name | Mode | Layout |
|---|---|---|---|
| 0 | `val_idx` | read | `array<u32>` |
| 1 | `new_point_x` | read | `array<vec4<u32>>` (pool plane 0) |
| 2 | `new_point_y` | read | `array<vec4<u32>>` (pool plane 1) |
| 3 | `active_sums` | read_write | `array<vec4<u32>>` (2-plane SoA, stride $M$) |
| 4 | `params` | uniform | `vec4<u32>` = $(\text{total\_slots}, M, \text{wstride}, \text{input\_size})$ |
| 5* | `new_point_y_neg` | read | `array<vec4<u32>>` (only when `with_sign`) |
| 6* | `bucket_and_sign` | read | `array<u32>` (only when `with_sign`) |

*Lever B `index_mode` mode* (level 0 only) — write a 4-byte handle, 16×
less memory. Downstream level-0 kernels gather from the pool on the fly.

| @binding | Name | Mode | Layout |
|---|---|---|---|
| 0 | `val_idx` | read | `array<u32>` |
| 1 | `active_sums` | read_write | `array<u32>` (flat, 4 bytes/slot) |
| 2 | `params` | uniform | `vec4<u32>` = $(\text{total\_slots}, \text{base\_offset}, \text{wstride}, \text{input\_size})$ |
| 3 | `bucket_and_sign` | read | `array<u32>` |

The `base_offset` (which is the polynomial's `srs_offset`) is baked in
*here* so the level-0 fused/carry/finalize kernels gather
`pool[pt_idx + base_offset]` without re-applying it.

Template params: `workgroup_size`, `index_mode`, `with_sign`.

### 4.2 `csr_to_v2_meta` — planner inputs

[wgsl/cuzk/csr_to_v2_meta.template.wgsl](../wgsl/cuzk/csr_to_v2_meta.template.wgsl).
One thread per `(j, k)`. Reads two adjacent `colPtr` entries and emits

$$
\text{activeCounts}[(j, k)] = \text{colPtr}_j[k+1] - \text{colPtr}_j[k],
\qquad
\text{activeOffsets}[(j, k)] = j \cdot n + \text{colPtr}_j[k].
$$

The offset globalisation saves the level-0 planner from adding window
bases in its inner loop.

| @binding | Name | Mode | Layout |
|---|---|---|---|
| 0 | `row_ptr` | read | `array<u32>` — §3 output `all_csc_col_ptr` |
| 1 | `active_counts` | read_write | `array<u32>` |
| 2 | `active_offsets` | read_write | `array<u32>` |
| 3 | `params` | uniform | `vec4<u32>` = $(B_W,\, T \cdot B_W,\, n,\, \,?\,)$ |

Dispatch: `(ceil((T·B_W) / workgroup_size), 1, 1)`. Run once per
window-batch, at the level-0 boundary. Levels ≥ 1 derive their own
counts/offsets from the previous level's residual (§4.4 planner Phase A).

### 4.3 `ba_planner_v2_offsets` / `_emit` — bin-packing pairs

Split from a single planner in commit `0999593b2a` so the O(pairs) work
runs in parallel across buckets instead of one workgroup per window.

`ba_planner_v2_offsets` — [wgsl/cuzk/ba_planner_v2_offsets.template.wgsl](../wgsl/cuzk/ba_planner_v2_offsets.template.wgsl).
One workgroup per window. Computes per-bucket
$(\text{pc}, \text{cf}, \text{nc})$ where

$$
\text{pc} = \lfloor N/2 \rfloor,
\quad
\text{cf} = \begin{cases} 0 & N = 1 \\ N \bmod 2 & \text{otherwise} \end{cases},
\quad
\text{nc} = \text{pc} + \text{cf}.
$$

Workgroup Hillis–Steele scans 3 totals (pair, carry, new) and writes
the per-bucket prefix offsets + per-window totals + level-wide
indirect-dispatch arguments.

| @binding | Name | Mode | Role |
|---|---|---|---|
| 0 | `counts` | read | Per-bucket $N$ at this level |
| 1 | `carry_off` | read_write | Per-bucket window-local carry prefix |
| 2 | `new_counts` | read_write | Per-bucket $\text{nc}$ (next-level count) |
| 3 | `new_offsets` | read_write | Per-bucket next-level start, globalised |
| 4 | `plan_meta` | read_write | Per-window $(\sum\text{pc}, \sum\text{cf}, \sum\text{nc})$ + indirect-dispatch args |
| 5 | `params` | uniform | $(\text{pair\_blocks\_per\_window}, \text{carries\_per\_window}, \text{wgi}, \text{wstride})$ |

Template constants: `workgroup_size` (TPB), `buckets_per_window` ($B_W$),
`per_thread` (= $B_W$ / TPB), `num_windows`.

Dispatch: `(batchWindows, 1, 1)`. O($B_W$) per window — flat in $n$.
(The template constant `NUM_WINDOWS` is set from the same value at shader
compile time.)

`ba_planner_v2_emit` — [wgsl/cuzk/ba_planner_v2_emit.template.wgsl](../wgsl/cuzk/ba_planner_v2_emit.template.wgsl).
Dispatch: `(ceil(B_W / TPB), batchWindows, 1)`. One thread per bucket
emits the $S$-wide `pair_block_plan`, `scatter_plan`, and `carry_plan`
entries. The window-local pair prefix is derived as
`new_offsets[b] - w·wstride - carry_off[b]` (`pc + cf = nc`).

Lever-E *self-pad*: the window's `NUM_GROUPS` workgroups cooperatively
fill the plan tail past the real entries with a pad trio
`(pad_l, pad_r, pad_d)`. Disjoint write ranges from the emit, so no
inter-workgroup ordering is needed.

Template constants: `workgroup_size`, `buckets_per_window`, `num_windows`,
`num_groups`, `pair_cap`, `s` (= $S$).

| @binding | Name | Mode | Role |
|---|---|---|---|
| 0 | `counts` | read | This-level per-bucket count |
| 1 | `offsets` | read | This-level per-bucket start (`active_sums_old`) |
| 2 | `carry_off` | read | Window-local carry prefix (§4.3 offsets pass) |
| 3 | `new_offsets` | read | Next-level per-bucket start (`active_sums_new`) |
| 4 | `plan_meta` | read | Per-window totals (§4.3 offsets pass) |
| 5 | `pair_block_plan` | read_write | $2S$ source indices per pair_block |
| 6 | `scatter_plan` | read_write | $S$ destination indices per pair_block |
| 7 | `carry_plan` | read_write | $(\text{src}, \text{dst})$ pair per carry |
| 8 | `params` | uniform | Same shape as offsets pass |
| 9 | `pad_params` | uniform | $(\text{pad\_l}, \text{pad\_r}, \text{pad\_d}, …)$ |

### 4.4 `ba_fused_super_bench` — the affine-add hot path

[wgsl/cuzk/ba_fused_super_bench.template.wgsl](../wgsl/cuzk/ba_fused_super_bench.template.wgsl).
The kernel that the whole pipeline is engineered around. One thread =
one `pair_block` of $S$ pairs sharing one inversion. Three phases per
thread:

1. *Forward.* For $k = 0..S{-}1$: $\delta_k = x_{2,k} - x_{1,k}$,
   $\pi_k = \pi_{k-1} \cdot \delta_k$; store $\pi_k$ to `pref_scratch`.
2. *Inversion.* One safegcd inverse, $\rho_S = \pi_S^{-1}$. Variant
   chosen by `inv_fn` template var (`'loop'` or `'pk'`; see §7).
3. *Backward peel.* For $k = S{-}1$ down to $0$:
   $\delta_k^{-1} = \rho_{k+1} \pi_{k-1}$, $\rho_k = \rho_{k+1} \delta_k$.
   Compute $\mu_k, x_{3,k}, y_{3,k}$ in 8×u32 field form (§7.2) and
   scatter to `active_sums_new[scatter_plan[t·S + k]]`.

**No** $P = \pm Q$ fallback — relies on the production contract
(SRS-backed inputs, no collisions).

| @binding | Name | Mode | Layout (default) | Layout (`l0_index_mode`) |
|---|---|---|---|---|
| 0 | `pair_block_plan` | read | `array<u32>` | same |
| 1 | `scatter_plan` | read | `array<u32>` | same |
| 2 | `active_sums_old` | read | `array<vec4<u32>>` (2-plane SoA) | `array<u32>` (flat handles) |
| 3 | `active_sums_new` | read_write | `array<vec4<u32>>` (2-plane SoA) | same |
| 4 | `params` | uniform | `(\text{total\_pair\_blocks}, M_\text{old}, M_\text{new}, \text{tile\_base?})` | same |
| 5 | `pref_scratch` | read_write | `array<vec4<u32>>` — forward prefix-product scratch | same |
| 6\* | `point_x` | read | — | `array<vec4<u32>>` (pool plane 0) |
| 7\* | `point_y` | read | — | `array<vec4<u32>>` (pool plane 1) |

\* Only bound when `l0_index_mode`.

Dispatch: indirect, sized from `plan_meta` (per-window totals + level
sum). When Lever A (`tiled`) is enabled, the dispatch is split into
$T_\text{TILE}$-sized tiles; `params.w` carries the tile's global base
so `pref_scratch` is sized for one tile rather than the whole level.

Template params: `s`, `workgroup_size`, `inv_fn`, `tiled`, `l0_index_mode`.

### 4.5 `ba_carry_copy_bench` — odd-count passthrough

[wgsl/cuzk/ba_carry_copy_bench.template.wgsl](../wgsl/cuzk/ba_carry_copy_bench.template.wgsl).
For each odd-count bucket, copies the leftover point
`active_sums_old[carry_plan[2t]] → active_sums_new[carry_plan[2t+1]]`.
Pure memory shuffle at level ≥ 1; at level 0 (with `l0_index_mode`) it
materializes the point from the pool and applies the sign.

| @binding | Name | Mode | Notes |
|---|---|---|---|
| 0 | `carry_plan` | read | $(\text{src}, \text{dst})$ pairs |
| 1 | `active_sums_old` | read | Default: 2-plane vec4 SoA; `l0_index_mode`: flat u32 handles |
| 2 | `active_sums_new` | read_write | 2-plane vec4 SoA |
| 3 | `params` | uniform | $(T_\text{carries}, M_\text{old}, M_\text{new}, …)$ |
| 4\*, 5\* | `point_x`, `point_y` | read | Only when `l0_index_mode` |

Dispatch: one thread per carry. Per-window total from `plan_meta[3w+1]`,
padded to `carries_per_window`.

### 4.6 `ba_finalize_copy_bench` — singleton harvest

[wgsl/cuzk/ba_finalize_copy_bench.template.wgsl](../wgsl/cuzk/ba_finalize_copy_bench.template.wgsl).
One thread per bucket. If `counts[b] == 1`, copies the bucket's single
remaining element to `bucket_result[b + bb_base]`. Run once per level;
across all levels every bucket is harvested exactly once (a finalised
bucket has count 0 thereafter, never seen at 1 again).

| @binding | Name | Mode | Notes |
|---|---|---|---|
| 0 | `counts` | read | This-level per-bucket count |
| 1 | `offsets` | read | This-level per-bucket start |
| 2 | `active_sums` | read | Default: 2-plane vec4 SoA; `l0_index_mode`: flat u32 handles |
| 3 | `bucket_result` | read_write | 2-plane SoA, stride `B_global` (Lever G: `B_global > B` if multi-batch) |
| 4 | `params` | uniform | $(B, M, \text{bb\_base}, B_\text{global})$ |
| 5\*, 6\* | `point_x`, `point_y` | read | Only when `l0_index_mode` |

Dispatch: `(numWgsFinalize, 1, 1)` — one workgroup per
$\lceil \text{batchBuckets} / \text{workgroup\_size} \rceil$, one thread
per `(j-in-batch, k)` bucket. Threads outside the batch's $B \cdot
\text{batchWindows}$ range no-op.

---

## 5. Branchless 4-phase reduction

Per-window suffix-sum $W_j = \sum_{k=1}^{B} k\, B_{j,k}$ via the running
pair $(m_t, g_t)$ identity ([FLOW.md §9](FLOW.md#9-stage-5--bucket-reduction-per-window-suffix-sum)).
Two kernels — an init and a templated per-level kernel that compiles to
three distinct phase variants chosen by a `kind*` flag.

### 5.1 `ba_reduce_init_bench`

[wgsl/cuzk/ba_reduce_init_bench.template.wgsl](../wgsl/cuzk/ba_reduce_init_bench.template.wgsl).
Repacks `bucket_result` (column 0 = zero digit, dropped; columns past
$2^{c-1}$ = padding, dropped) into `red_buf` (stride $2^{c-1}$, a power
of two — required by the 4-phase reduction). One thread per
`red_buf` element; sets `is_present[g] = 1` iff the bucket's accumulate
output is non-zero.

| @binding | Name | Mode | Layout |
|---|---|---|---|
| 0 | `bucket_result` | read | `array<vec4<u32>>`, 2-plane SoA, stride `B_TOTAL = T · B_W` |
| 1 | `red_buf` | read_write | `array<vec4<u32>>`, 2-plane SoA, stride $T \cdot 2^{c-1}$ |
| 2 | `is_present` | read_write | `array<u32>`, one bit per slot stored as a u32 |
| 3 | `params` | uniform | $(T \cdot 2^{c-1},\, 2^{c-1},\, B_W,\, T \cdot B_W)$ |

Dispatch: `(ceil(total / workgroup_size), 1, 1)`. One thread per slot;
"empty-bucket = all-zero" check is done as the OR of all 16 limbs.

### 5.2 `ba_reduce_level_bench` (three kinds)

[wgsl/cuzk/ba_reduce_level_bench.template.wgsl](../wgsl/cuzk/ba_reduce_level_bench.template.wgsl).
The host issues one dispatch per schedule entry. The kernel template
compiles to three distinct shaders selected by `kind0`/`kind1`/`kind2`,
each straight-line code for one phase:

| Kind | Operation | `src`, `dst` indexing (per thread $j_2$) |
|---|---|---|
| `kind0` | **Suffix add** (phase-A running $m$): $\text{slot}_{j_2 \cdot p_a + p_b - 1} += \text{slot}_{j_2 \cdot p_a + p_b}$ | $\text{src} = j_2 p_a + p_b$, $\text{dst} = j_2 p_a + p_b - 1$ |
| `kind1` | **Tree add** (phase-B/D pair-fold): $\text{slot}_{2 j_2 p_a} += \text{slot}_{(2 j_2 + 1) p_a}$ | $\text{src} = (2 j_2 + 1) p_a$, $\text{dst} = 2 j_2 p_a$ |
| `kind2` | **Point double** (phase-C): $\text{slot}_{(j_2 + 1) p_a}$ doubled in-place using $\lambda = 3 x^2 / (2 y)$ | self-double on `slot = (j_2 + 1) p_a` |

All three variants use the same prefix-product → single safegcd
inversion → backward-peel skeleton as `ba_fused_super`. The candidate
denominator is masked by `present` and replaced with the field identity
$R$ when absent, so out-of-range candidates contribute identity to the
product without branching.

**Branchless invariant.** Every data-dependent decision (presence,
add-vs-copy-vs-skip, denominator selection) is a `select`, never an
`if`. The only surviving `if` is the workgroup-tail store guard for
$j_2 \ge \text{ppw}$, which suppresses red_buf / is_present writes to
avoid corrupting neighbouring windows. The header explains why: keeping
a single straight-line path live is what the Adreno register allocator
needs to schedule without spilling.

| @binding | Name | Mode | Layout |
|---|---|---|---|
| 0 | `red_buf` | read_write | `array<vec4<u32>>`, 2-plane SoA |
| 1 | `is_present` | read_write | `array<u32>` |
| 2 | `pref_scratch` | read_write | `array<vec4<u32>>` |
| 3 | `cparams` | uniform | $(M, \text{maxc}, \text{stride}, …)$ — constant across levels |
| 4 | `lparams` | uniform | $(p_a, p_b, \text{ppw}, …)$ — this level's schedule |

Dispatch: `(this.numWindows, 1, 1)` — one workgroup per window (the
*full* $T$ here; this runs once after all window-batches have built
their `bucket_result` rows). Each thread
handles `C = ceil(ppw / WG)` candidates; the prefix is buffered in
`pref_scratch[scratch_base..]` with `scratch_base = (w · WG + tid) · maxc`.

Output: `red_buf[(j, 0)] = W_j` (Montgomery form) for each $j \in [0, T)$
after the level schedule completes. The copy into the host staging
buffer is encoded as `copyBufferToBuffer` calls at the end of the
window-batch ([msm_v2.ts:2147-2152](../msm_v2.ts#L2147-L2152)).

Template params: `workgroup_size`, `inv_fn`, `kind0` / `kind1` / `kind2`
(mutually exclusive).

---

## 6. Native Horner — `combine_windows`

Not a WGSL kernel. After Stage 5, the host de-Montgomeryises the $T$
window sums and writes them into the WASM-side result region; the C++
caller calls `combine_windows`. Listed here because it's the final
arithmetic step of the MSM, even though it runs natively.

[webgpu_msm_marshalling.hpp:104-117](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp#L104-L117):

```cpp
acc = read_affine_le(&buf[(T - 1) * 64]);              // top window
for (int w = T - 2; w >= 0; --w) {
    for (uint32_t d = 0; d < c; ++d) acc.self_dbl();   // ×2^c in Jacobian
    acc += read_affine_le(&buf[w * 64]);
}
return AffineElement{ acc };
```

Computes $S = \sum_{j=0}^{T-1} 2^{jc}\, W_j$. The fold runs in
*Jacobian* (so every doubling is inversion-free); one final affine
normalisation at the end.

**`(0, 0) → infinity` decode.**
[`read_affine_le`](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp#L81-L97)
maps an all-zero 64-byte input to `AffineElement::infinity()`. Without
this, an empty per-window bucket sum (which marshals as 64 zero bytes)
would feed `(0, 0)` into Jacobian addition and trigger `invert(0)` on
the first doubling.

**Why not on the GPU?** $T \in [7, 33]$ for our $c$ table; dispatch +
readback would dominate the actual compute. Discussed in [FLOW.md §10.4](FLOW.md#104-horner-fold-in-native-bbg1).

---

## 7. Field arithmetic

### 7.1 20×13 limb layout

Most WGSL field code stores an element of $\mathbb{F}_q$ as **20 limbs ×
13 bits per limb**. The width is forced by two constraints — schoolbook
multiply's accumulator must fit in 32 bits ($2w + \lceil \log_2 L \rceil
\le 32$, so $w \le 13$ at $L = 20$), and $L w \ge 254$ forces $w \ge 13$
at $L = 20$. Hence $w = 13$ is the unique integer satisfying both.

[wgsl/field/](../wgsl/field/), [wgsl/montgomery/](../wgsl/montgomery/),
[wgsl/bigint/](../wgsl/bigint/) provide:

- `BigInt` struct (20 × u32; limbs hold 13 valid bits each).
- `field_mul`, `field_add`, `field_sub` — 20-limb schoolbook with
  Barrett reduction.
- `montgomery_product` — 20×13 Montgomery multiply (CIOS variant).
- `unpack256_to_limbs`, `pack_limbs_to_256` — convert between the 8×u32
  packed form (§7.2) and 20×13 layout.

Inner-mul count is $L^2 = 400$ per outer multiply (vs $81$ for 9×29
WASM and $16$ for native 4×64). The GPU compensates with parallelism —
every thread runs an independent field mul.

### 7.2 8×u32 "live form"

The fused kernels (`ba_fused_super`, `ba_reduce_level`) hold multiple
field elements simultaneously live — the 20×13 layout exhausts the
register budget and forces spills. MsmV2 packs the same canonical
residue into a tighter **8×u32 = 256-bit** representation inside those
kernels, with `dec_pack` / `dec_unpack` helpers
([wgsl/field/field8.template.wgsl](../wgsl/field/field8.template.wgsl))
converting at the boundary.

Operations available on the 8×u32 form: `fr_add_f8`, `fr_sub_f8`,
`montgomery_product_f8`, `get_r_f8` (Montgomery one), `fr_select_f8`
(branchless 8-wide select). Conversion to 20×13 only happens when
crossing into the safegcd inverse — one pack/unpack pair per
`pair_block` rather than per pair.

### 7.3 Modular inverse — `'loop'` vs `'pk'`

`MsmConfig.invVariant` ([msm_v2.ts:60](../msm_v2.ts#L60)) selects the
GPU inverse:

- `'loop'` — Bernstein-Yang safegcd with one iteration per loop body.
- `'pk'` (default) — same algorithm, **packed 2 × 13-bit digits per
  loop body**, so half as many iterations. Introduced in commit
  `082ed17754`.

Both implement: given $u \in \mathbb{F}_q$, return $u^{-1}$. The fused
super kernel uses *exactly one inverse per pair_block* (one inversion
amortised across $S$ pairs), so the variant choice matters
disproportionately — `'pk'` is the only one in any production
benchmark. Source: [wgsl/inverse/](../wgsl/inverse/) (template included
via `{{> inverse_funcs }}` and the per-kernel `{{ inv_fn }}` template var
selects which symbol the kernel calls).

The host's `combineOnHost: true` mode (dev-bench path) instead uses JS
`modInverse(z, FP)` for the final Jacobian → affine. That path is never
on the bridge.

### 7.4 Where each form lives

| Stage | Live field form |
|---|---|
| `convert_points_only` output | 8×u32, Montgomery |
| `bucket_and_sign` | u32 (bucket + sign) |
| `valIdxs`, `colPtr` | u32 (no field) |
| `active_sums` (level 0, index_mode) | u32 (handle + sign) |
| `active_sums` (level ≥ 1) | 8×u32, Montgomery, 2-plane SoA |
| Inside `ba_fused_super` / `ba_reduce_level` registers | 8×u32 |
| Inside `montgomery_product_f8` | 8×u32 → 20×13 internally → 8×u32 |
| Inside safegcd `inv_fn` | 20×13 |
| `bucket_result`, `red_buf` | 8×u32, Montgomery |
| Per-window sums in staging | 8×u32, Montgomery |
| Per-window sums in WASM heap (post `writeWindowSumsLE`) | 64 bytes canonical LE |

---

## 8. Memory levers (the five from the file header)

*To fill — `msm_v2.ts` file header lists "window batching, index-mode
level-0, tiled fused dispatch, plan-buffer ring, dropped −y plane". Each
deserves a paragraph explaining what it is, what it cost in eng effort,
what it bought in GPU memory.*

*Out of scope for M2; tracked as a follow-up.*

---

## 9. Bridge protocol

*Already covered functionally in [STATUS.md](STATUS.md#bridge-wasm--gpu)
and structurally in [FLOW.md §1](FLOW.md#1-top-level-call-path). Expand
here only with the bits that affect algorithm thinking — e.g. why
single-encoder mixed-N matters for utilization, why same-N falls back to
serial submit.*
