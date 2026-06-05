# Handoff: porting `wt/structure`'s two reduce threads onto the arena branch

> **STATUS (Thread 1 — DONE, validated).** The Jacobian bucket-reduce is ported,
> wired to `jacobianCrossover`, and validated on M2: golden byte-identical at logN
> 14/15/16/17 with Jacobian forced on (`?jaccross=999999`) and via JAC_AUTO
> (`?jaccross=-1`); profiles D+E oracle-agree (giant buckets) with jac on; each new
> kernel compiles once per pool (one-program holds); arena 93.71 MiB @ logN17
> (≤160). Default stays **off** (`jacobianCrossover = 0`) — production auto-enable
> is a device-specific tuning follow-up.
>
> **STATUS (step-4 — DONE, validated).** The per-level affine/Jacobian cut +
> batched `ba_reduce_jac_to_affine` convert are ported (`?perlevel=1`, `?redsat=N`,
> `?convc=N`, `?convbound=N`; default off). The convert is flat-slot (no
> reduce_sched — converts all `[0, RED_M)` slots) and reuses `reducePrefScratch`
> (capMAXC bumped to `ceil(stride/REDUCE_WG)` on a jac→affine flip). Validated on
> M2: byte-identical logN 14-17 with perlevel on and with the convert force-enabled
> (`?convbound=99999999`); D+E oracle-agree; convert compiles once/pool; arena
> 94.96 MiB @ logN17. At logN17 `pickC=13` (redM≈82k ≤ default convbound 150k) so
> the convert fires by default there. Commits: `702f3cbd44` (Thread 1),
> `170b493bee` (step-4) — local, unpushed. **Remaining: Thread 2 (high-mem A/B
> pingpong) + production auto-enable.**
>
> **Correction to the note below:** the **affine reduce is NOT identical on both
> sides.** This branch moved `ba_reduce_level_bench` onto a per-window
> `reduce_sched` schedule table (split-c aware; `base = reduce_sched[row].x`,
> `(pa,pb,ppw,kind) = reduce_sched[row+1+lv]`), while `wt/structure` still uses the
> old `base = w*stride` / `lparams=(pa,pb,ppw,kind)` convention. **Any reduce kernel
> lifted from `wt/structure` (incl. Thread 2's) must be re-plumbed onto
> `reduce_sched`** — that was the main adaptation for Thread 1's `ba_reduce_level_jacobian`
> and `ba_reduce_jac_finalize`. `ba_reduce_z_init` needed no schedule (per-slot).

**Goal.** Bring two algorithmic threads from branch `wt/structure` into this branch
(`msm-arena-rewrite`, worktree `~/localclaudebox/wt-memory`) and adapt them to the
**6-colour scratch arena** + the **one-program (size-independent)** invariant that
this branch now holds.

- **Thread 1 — Jacobian bucket-reduce.** Switch the bucket reduction to Jacobian
  (inversion-free) arithmetic when a saturation threshold is crossed. *Start here.*
- **Thread 2 — high-memory A/B pingpong backend.** The old fallback pair-tree
  pingpong for small MSMs: faster, uses more memory (fine because the MSMs are
  small). Bigger, structural — do *after* thread 1.

This is a **port, not a `git merge`.** Both branches forked from `68a71483`
("walker working baseline as clean fork point") and then restructured in
incompatible directions: this branch kept the `msm_v2.ts` monolith and added the
arena + union/bridge + one-program + oracle; `wt/structure` *renamed*
`msm_v2.ts → msm_stream_walker.ts` and split into a dual-backend factory
(`msm.ts` + `msm_pool.ts` + `msm_stream_walker.ts` + `msm_high_memory.ts` + `msm_types.ts`).
A real merge of the renamed-and-+12k-line file is hopeless; lift each thread's
algorithm + WGSL and re-implement against `msm_v2.ts` + the arena. The shared
baseline means the common code (transpose, decompose, stream-walker core, the
**affine** reduce `ba_reduce_level_bench`) is identical on both sides — only the
reduce *extension* and the backend *structure* diverged.

## Where everything is

| | path / ref |
|---|---|
| This branch (target) | `~/localclaudebox/wt-memory`, branch `msm-arena-rewrite` |
| Source branch | `~/localclaudebox/wt-structure`, branch `wt/structure`, HEAD `619b4bd528` |
| Common base | `git merge-base wt/structure msm-arena-rewrite` = `68a71483` |
| Diff scope | `git diff 68a71483..wt/structure --stat` (30 commits, +12k lines) |
| MSM source | `barretenberg/ts/src/msm_webgpu/` (`msm_v2.ts` is the monolith here) |
| Arena spec | `msm_webgpu/ARENA_LAYOUT.md` (read it) |
| One-program spec | `msm_webgpu/PIPELINE_GEOMETRY_HANDOFF.md` (the work just completed) |

**Memory notes (read before building thread 1):**
- `msm-webgpu-perlevel-jac-cut.md` — the per-level affine/jac refinement + the
  **batched jac→affine convert**; perf regime (wins c≤13–14, regresses c≥15;
  convert is mul-bound ~6 muls/point and scales with slot count). Convert chunk
  C=8 is the floor.
- `msm-webgpu-reduce-2x-conservation.md` — baselines: affine reduce 6.15 ms,
  single-cut 5.76, ceiling 4.83 (logn17/profA/c=13, M2). The "2× = abandon
  reformulation" claim is **wrong**; treat 4.83 as the target.
- `feedback-reduce-session-stay-on-task.md` — **the operator's directive: build
  the reduce, do NOT editorialize that it's "only ~4% e2e" or that the walker
  (68%) dominates. They know. Just build.**
- `msm-webgpu-arena-refactor.md` — the 6-colour rule (below).

## What this branch already holds (constraints the port must respect)

1. **6-colour scratch arena.** 36 scratch buffers were consolidated into 6
   colour-partitioned `arenas: GPUBuffer[]`; each logical buffer is a 256-B-aligned
   sub-range (`GPUBufferBinding` slot) carved by `carve(color, bytes)` in
   `ensureScratch` (`msm_v2.ts:1154`). **The 6-colour count is the chromatic number
   of a Dawn ro/rw conflict graph: if the same underlying arena buffer is bound
   read-write in one binding and read-only in another *within one bind group*,
   Dawn silently outputs 0 (no error).** Colour-mates must never be co-bound with
   mismatched access. Sizing is `arenaColourSizes()` (`msm_v2.ts:72`) and **must
   match the `carve` order term-for-term** (`msm_v2.ts:1161–1196`). Helpers:
   `slotBuf`/`slotOff`/`slotSize`/`clearSlot`/`writeSlot` (`:54`); `mkBind` is
   polymorphic over `GPUBuffer | GPUBufferBinding`.
2. **One program for any N.** No MSM shader may bake geometry (`BW`/`stride`/`tile`/
   `MPW`) into the WGSL string — the `PipelineCache` keys on the string, so a baked
   constant = a per-`(n,c)` recompile. Geometry rides in uniforms or is fixed
   (transpose `tile`). **Any kernel ported from `wt/structure` bakes geometry and
   must be made size-independent**, or it re-adds the ~2 s cold-compile tax just
   removed. See PIPELINE_GEOMETRY_HANDOFF.md for the pattern (const→uniform lane,
   or fixed worst-case for workgroup arrays).
3. **The hooks already exist.** This branch carries an inert `jacobianCrossover`
   config (`msm_v2.ts:222, 1586, 1901`, default 0) and the **dead** `bufA`/`bufB`
   pingpong buffers (`msm_v2.ts:706–707, 957–977`, M1-sized, bound to no live
   pipeline — `:2526`). i.e. the branch anticipated both threads.
4. **Validation discipline (must stay green after every step):**
   - golden byte-identical: `bash ~/localclaudebox/msm-arena-validate.sh 5210`
     (logN 14–17, seed 12345, vs WASM-MT oracle). Vite serves this worktree on
     `:5210` (`cd barretenberg/ts && yarn dev:msm-webgpu --port 5210`).
   - real-host union: `?autorun=msm-bridge-e2e&logns=14,16,17`.
   - profiles D+E (giant-bucket paths): cross-check `&scalar_dist=profile&profile=E`.
   - one-program: instrument `PipelineCache.getPipeline` to log compiles, run a
     multi-size session (`msm-bridge-e2e&logns=13,14,15,16,17`), confirm **each
     kernel compiles once** (see PIPELINE_GEOMETRY_HANDOFF.md).
   - **After WGSL edits, regenerate**: `node src/msm_webgpu/scripts/inline-wgsl.mjs`.

---

## THREAD 1 — Jacobian bucket-reduce (start here)

The affine reduce `ba_reduce_level_bench` is **shared** between the branches, so
this is an *alternative reduce path* selected by a threshold — `jacobianCrossover`
is already a stub. Algorithm (from `wt/structure`, all-or-nothing per the committed
`619b4bd`; a per-level mid-cut refinement exists in the perlevel-jac memory):

- gate: `jacFromLevel = numWindows·maxPpw < T_SAT_REDUCE(16384) ? 0 : numLevels`
  (`msm_stream_walker.ts:1655–1668`) → run **all** levels Jacobian (inversion-free)
  when the lowest level can't saturate the GPU, else affine. `useJac[]` is the
  per-level mask (`:1313`).
- kernels (in `wt/structure/.../wgsl/cuzk/`):
  - `ba_reduce_z_init.template.wgsl` — seed Z = R (Montgomery 1) for present
    buckets, Z = 0 for absent. Binds `is_present`(RO), `red_z`(RW), uniform.
  - `ba_reduce_level_jacobian.template.wgsl` — Jacobian add/double for one level.
    Binds `red_buf`(RW), `red_z`(RW), 2 uniforms. Dispatch `numWindows` × `REDUCE_WG`.
  - `ba_reduce_jac_finalize.template.wgsl` — convert each window root back to
    affine (X/Z², Y/Z³) in place + restamp `is_present`. Binds `red_buf`(RW),
    `red_z`(**RO**), uniform, `is_present`(RW). Dispatch `ceil(numWindows/WGI)`.
  - (optional later) `ba_reduce_segmented`, `ba_reduce_level_hm`,
    `ba_reduce_gather_canonical`, `ba_reduce_init_bench` — segmented/high-mem/
    CPU-split variants; not needed for the basic single-path port.
- host driver (`msm_stream_walker.ts`): layouts `:1733–1735`, `redZBuf` alloc
  `:2535–2539` (size `2·RED_M·16` ≈ half of `redBuf`'s `64·redM`), binds
  `:2552/2556/2558`, dispatch loop `:3286–3309`.

### Port steps

1. **Bring the 3 WGSL kernels** into `msm_v2/wgsl/cuzk/`, add their `gen_*` to
   `cuzk/shader_manager.ts`, **and make them size-independent** (no baked
   `BW`/`stride` — read from a uniform lane like the existing reduce, or the
   `params` they already bind). Regenerate `_generated/shaders.ts`.
2. **Carve `redZBuf` into the arena.** Its access is **RW** in `z_init`/`jac_level`
   and **RO** in `jac_finalize` (and the convert, if you add it). The conflict
   graph:
   - co-bound with `red_buf`/`is_present` (both **A1**) at mismatched access in
     `jac_finalize` → `redZBuf` ≠ A1.
   - the optional convert reuses `reducePrefScratch` (**A0**, RW) while reading
     `red_z` RO → `redZBuf` ≠ A0.
   - **never** co-bound with any A2–A5 buffer (those are walker/planner buffers,
     absent from reduce kernels). **So `redZBuf` slots into an existing colour
     (A2–A5) — no 7th colour needed.** Concretely: add one `carve(color, 32·RED_M)`
     call at the matching position in the carve block, add the same term to that
     colour's `arenaColourSizes` sum (term-for-term order!), and check the budget
     (`pool.statsBytes()` ≤ 160 MB; for the c≤14 regime where Jacobian wins,
     RED_M is moderate so headroom is fine).
   - **Verify** the chosen colour with the validator's profile-D/E cross-checks —
     a silent ro/rw collision shows up as output 0, not an error.
3. **Wire the gate** to `jacobianCrossover` (already in config). Default off /
   auto-select only the c-regime where it wins (c≤13–14 on M2; device-specific —
   per `msm-webgpu-perlevel-jac-cut`).
4. **(Optional refinement)** the per-level affine/jac mid-cut + batched
   jac→affine convert (`ba_reduce_jac_to_affine` + `gen_…`, reuses
   `reducePrefScratch` — **bump `capMAXC` to `ceil(stride/2 / REDUCE_WG)`** so the
   convert's per-slot prefix store fits). Knobs in the source: `?perlevel`,
   `?redsat=N`, `?convc=N`. Wins c=13 (5.53 vs 6.15), regresses c=15 (convert
   2.16 ms). Only productionize behind a c-gate.

### Thread-1 acceptance

golden byte-identical at logN 14–17 **with the Jacobian path forced on** (it must
produce the *same* MSM result — the reduce is mathematically identical, only the
representation changes); profile E green; one-program compile-count unchanged;
budget ≤ 160 MB; reduce-phase timing matches the source's per-level numbers
(reproduce against `~/localclaudebox/reduce-per-level-logn17-profA.md` if present).

---

## THREAD 2 — high-memory A/B pingpong (do after thread 1)

Separate **backend** in `wt/structure` (`msm_high_memory.ts`, 2883 LOC) for small
MSMs. `bufA`/`bufB` (the pingpong pair, `64·M1` each) **already exist** in this
branch but are dead; `bucketResultBuf` (`64·bTotal`, chunk accumulator) is new.
The pingpong "uses more memory" but is gated to small MSMs, so it stays under
budget and `bufA`/`bufB` can keep their standalone (non-carved) status.

**The hard part is structural, not the buffers.** Two shapes:
- **(a) adopt the dual-backend factory** (`msm.ts`/`msm_pool.ts` + a high-mem
  backend). This collides with this branch's *newest* work — the union multi-MSM
  path, the bridge, and oracle routing are all built around single-backend
  `msm_v2`. You'd have to teach each "which backend runs this MSM."
- **(b) add it as a mode inside `msm_v2`** — route small MSMs through the pingpong
  reduce + chunking + `ba_finalize_accumulate` within the same arena/run-loop.
  Smaller blast radius; graft the chunk/accumulate logic into `msm_v2`'s dispatch.

Its kernels (`ba_fused_super`, `ba_fused_tail_coop`, `ba_finalize_accumulate`,
`ba_carry_copy`, `ba_planner_v2_*`, …) also bake geometry → same size-independence
treatment. Defer the (a)-vs-(b) decision until thread 1 lands and you've seen how
much of the union/bridge/oracle structure thread 2 actually has to touch.

---

## Cross-cutting (both threads)

- **One-program is the sleeper cost.** ~10 new WGSL kernels + a 967-line
  `shader_manager.ts` divergence, all written pre-size-independence. Ported naively
  they re-add per-size compilation. `_generated/shaders.ts` (6439-line diff) is
  generated — regenerate after templates, don't merge it by hand.
- **Three invariants now, not one:** arena colour-correctness (silent Dawn ro/rw→0),
  golden byte-identical + profile D/E, **and** one-program compile-count.
- **Don't `git merge`.** Cherry-lift algorithm + WGSL; rebuild the host wiring on
  `msm_v2.ts`.

## State of the target branch as of this handoff

`msm-arena-rewrite` @ `0e3ff400fa` (pushed). Recent work: one-program for every N
(size1/stream_walker/pt_finalize/transpose/8 flat_bid kernels/cumsum/partition_wg),
oracle MSM routing + `yarn-project/ivc-integration/scripts/bench-oracle-prove.sh`.
Tree clean. The arena + one-program + oracle are the constraints; the
`jacobianCrossover` stub + dead `bufA`/`bufB` are the hooks.
