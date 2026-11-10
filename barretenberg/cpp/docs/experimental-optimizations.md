# Experimental BB optimisations

One binary contains the existing and experimental implementations. Set
`BB_EXPERIMENTAL_OPTIMIZATIONS=1` before starting BB to enable the tagged atomic
native thread pool, short-carry Montgomery arithmetic, batched inversion divsteps,
fused scalar MSM drains, and supported IFMA MSM and univariate kernels. An unset
variable or `0` selects the existing implementations. Other values are rejected.

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
environment or default to OFF in browsers. Settings are passed into the native
child process or WASI environment before backend initialization. Each child
process or WASM module owns its own selection. Native FFI configuration is shared
by all callers in the process.

Run differential fuzzers in separate processes with the environment set to `0`
and `1`, reusing the same corpus. Unsupported CPUs always retain the scalar
fallback. Hardware-specific kernel tests skip execution when IFMA is unavailable.

Singleton initialization snapshots resolved settings before attempting backend
creation or fallback. Repeating initialization with omitted settings reuses the
instance; explicitly requesting a different experimental setting fails without
discarding the running instance. Destroy and recreate the backend to change it.
