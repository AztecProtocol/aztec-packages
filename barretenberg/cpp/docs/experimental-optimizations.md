# Experimental BB optimisations

One binary contains the existing and experimental implementations. Set
`BB_EXPERIMENTAL_OPTIMIZATIONS=1` before starting BB to enable the tagged atomic
native thread pool, short-carry Montgomery arithmetic, batched inversion divsteps,
fused scalar MSM drains, and supported IFMA MSM and univariate kernels. An unset
variable or `0` selects the existing implementations. BB rejects other values.

IFMA requires the supported compiler, field, CPU instructions and OS register
state. Eligible native MSM reductions use IFMA; other applicable reductions use
the fused scalar drain. WASM uses its applicable arithmetic improvements and
retains its existing thread pool. There is no compile-time inclusion option.

The CLI initializes configuration before executing commands. The in-process FFI
dispatcher initializes it before constructing its request context. Native callers
can set the environment before the first FFI request; direct C++ callers must call
`bb::initialize_experimental_optimizations()` before arithmetic, CRS initialization
or launching workers. Initialization is thread-safe and reads the environment only
once. Later environment changes have no effect. Hot arithmetic reads cached
booleans without an initialization guard, mutex or atomic load.

bb.js accepts `experimentalOptimizations` in backend initialization options.
An explicit boolean overrides the Node environment; omitted settings use the Node
environment or default to false in browsers. bb.js passes the settings into the
native child process or WASI environment before backend initialization. Each
child process or WASM module has its own setting. All callers in a process share
the native FFI configuration.

Run differential fuzzers in separate processes with the environment set to `0`
and `1`, reusing the same corpus. Unsupported CPUs always retain the scalar
fallback. Hardware-specific kernel tests skip execution when IFMA is unavailable.

Singleton initialization saves the resolved settings before creating a backend
or trying a fallback. Repeating initialization with omitted settings reuses the
instance; explicitly requesting a different experimental setting fails without
discarding the running instance. Destroy and recreate the backend to change it.

## Rollup optimisations

`ROLLUP_EXPERIMENTAL_OPTIMIZATIONS=1` independently enables deferred native IPA
openings, bounded SRS folding scratch, skipping unused non-ZK recursive mock proofs,
curve witness preparation, lookup construction, range/selector construction, and
parallel copy-cycle/selector copying. It defaults to off, accepts only `0` or `1`,
and freezes with the other settings before workers start. The larger non-native
construction and ACIR rewrite are not included.

bb.js accepts `rollupExperimentalOptimizations` with the same environment override
and singleton rules as `experimentalOptimizations`. None of these settings enables
another group. Shared construction paths can also be exercised by client circuits;
the flag names the selected optimization family rather than restricting circuit types.

Compare each setting in separate processes. Circuit witnesses, gates, verification
keys and proof validity must remain equivalent with the rollup flag on and off.
Native IPA work overlaps circuit/proof construction when enabled and completes
synchronously when disabled. Unsupported native-only paths retain their WASM fallback.
