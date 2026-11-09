# Experimental thread pool

Set `--experimental-thread-pool` before the `bb` or `bb-avm` subcommand:

```sh
bb --experimental-thread-pool prove ...
bb-avm --experimental-thread-pool avm_prove ...
BB_EXPERIMENTAL_THREAD_POOL=1 bb prove ...
```

Both CLIs use the mutex pool by default. Set `BB_EXPERIMENTAL_THREAD_POOL=0` to
keep that default. An explicit CLI value overrides the environment variable,
including `--experimental-thread-pool=false`.

The flag selects generation-tagged atomic claims for `parallel_for` and its range
and heuristic helpers. Each calling thread constructs its selected pool on first
use. All threads use the same selection. The older `parallel_for_atomic_pool.cpp`
has no callers. This flag does not control AVM memory optimizations.

C++ applications call `bb::configure_experimental_thread_pool(true)` during
initialization and check its return value. The first native pool job fixes the
selection for the process. Later attempts to change it return false. Repeating
the current selection succeeds. The getter
`bb::experimental_thread_pool_enabled()` does not initialize a pool. Only the CLI
reads the environment variable. Embedded callers configure the runtime through
these functions.

WASM, OpenMP and builds without multithreading reject experimental selection.
The CLI reports an error if the build cannot use the requested pool.

## Validation

`common_tests` checks that each iteration runs once and its writes are visible
when the job returns. It also tests repeated jobs, waking idle workers, independent
owners, nested calls and shutdown. Configuration tests start fresh subprocesses
for each selection. Run the tests with a process timeout to catch hangs.

`common_parallel_for_tagged_atomic_pool_fuzzer` creates a
`bb::detail::TaggedAtomicThreadPool` for each input. It runs up to 32 jobs with at
most three workers and 255 iterations per job. It compares results with a sequential
model and tests idle transitions and destruction. It does not change the process's
pool selection.

Calls to an explicit pool instance must be serialized. Its callbacks must not
throw or reenter that instance. Use repeated runs and ThreadSanitizer to check
accesses under different thread schedules.
