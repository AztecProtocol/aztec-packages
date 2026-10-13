# CI3

This document describes CI3, the CI system for aztec-packages: its design, the commands, and how to use it.

Owners: see `CODEOWNERS` (`/ci3/`, `/.github/`, `/build-images/`).

CI3:

- Is vendor agnostic. GitHub Actions configuration is kept to a minimum, and most CI tasks can be run from the terminal.
- Runs the same commands a developer runs, in the same environment. It therefore also tests the development container and the bootstrap scripts.
- Is stateless on build instances. Build artifacts are uploaded to and downloaded from an S3 bucket.
- Uses Docker only for:
  - Building the development container in `build-images`.
  - Running the bootstrap in CI in the development container.
  - Isolating tests that use the network stack.
  - Restricting resources such as vCPUs, memory and storage.
- Provides a consistent command interface on `./bootstrap.sh` scripts. Each project script exposes its tests via `test_cmds`, and the root build runs all of them in parallel.
- Runs each CI job on a single large EC2 instance (192, 128 or 64 vCPUs on amd64; 64 on arm64).
- Grinds tests in the merge queue into `next` to catch flaky tests (see [Running CI](#running-ci)).
- Provides a shared redis cache at the test level, so CI does not run the same test twice (except when grinding).
- Displays only the logs of failed steps by default, while storing all logs in redis. Developers can "drill down" into logs via log ids.
- Keeps repository clutter low. Outside `ci3/`, a project needs only its bootstrap script, a `run_test.sh` script and a few helper scripts.

## The Scripts

These are the main scripts:

- `/ci.sh` - CI workflow: triggering CI runs on EC2, viewing logs, opening shells on remote machines, etc.
- `/bootstrap.sh` - Root bootstrap script. Builds the repository through the root `Makefile`, and runs the CI and release flows.
- `/**/bootstrap.sh` - Project bootstrap scripts. They follow common patterns, for example `test_cmds` to print the project's test commands. Where possible, keep _everything needed to **bootstrap, test, and release** the project in this one script_.
- `/**/scripts/run_test.sh` - Runs a _single_ test, given arguments. The test commands printed by `./bootstrap.sh test_cmds` usually call this script.
- `/Makefile` - Build order and dependencies between projects. Its `*-tests` targets do not run tests: they append test commands to `/tmp/test_cmds`, which the test engine (`ci3/test_engine`) runs.

Do not add one-off helper scripts for your workflow. If a workflow is missing, extend the existing bootstrap scripts instead.

Some bootstrap scripts provide project-specific commands. For example, `noir-projects/fnd/noir-contracts/bootstrap.sh` offers a compile command:

```
./bootstrap.sh compile <contract-name>
```

Each script lists its commands in the `case` block at the bottom.

## Getting Started

Add the following aliases to your `~/.zshrc`. The rest of this document assumes they exist.

```
alias ci='$(git rev-parse --show-toplevel)/ci.sh'
alias dl='$(git rev-parse --show-toplevel)/ci.sh dlog'
```

`ci <cmd>` then runs the CI script, and `dl <id>` shows a denoised log.

### Getting the repository into a runnable state.

After cloning the repository, run:

```
./bootstrap.sh
```

This installs the git hooks and runs `make fast`. It uses the S3 cache to get the repository into a runnable state as fast as possible. On a laptop, use `./bootstrap.sh gentle`, which builds with less parallelism.

Other forms:

```
./bootstrap.sh check           # check required toolchains and versions
NO_CACHE=1 ./bootstrap.sh      # build without downloading from the cache
./bootstrap.sh build full      # make full: also the full test builds and labs extras
make <target>                  # build one component, e.g. make bb-cpp-native
```

After `./bootstrap.sh` you should have a fully runnable repository, including the ability to run all the tests.

### Cleaning the repo.

```
./bootstrap.sh clean
```

This erases untracked files, submodules, git hooks, etc. It asks for confirmation. Use with caution locally.

### Running tests.

Tests run per project, via that project's bootstrap script:

```
barretenberg/cpp/bootstrap.sh test
l1-contracts/bootstrap.sh test
```

This runs the project's entire test suite. Do not run large suites on the mainframe: several users doing so at once can overload it.

Tests run in parallel, limited to half the number of vCPUs (usually the number of physical cores).

The root `./bootstrap.sh` has no `test` command. The full-repo build-and-test flow is what CI runs via `./bootstrap.sh ci-fast` / `ci-full`.

### Test commands.

To see the test commands for a project, run its `test_cmds` command:

```
barretenberg/cpp/bootstrap.sh test_cmds
```

The output is filtered to remove tests marked `skip` in the root `.test_patterns.yml` file. You'll get something like:

```
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates_with_shifts
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_boolean_gates
```

The first field is the "test hash" (see [Cache](#cache)). Run the rest of the line from the repository root to run the test manually.

Most projects have a `scripts/run_test.sh`, the test runner that translates project-specific arguments into a test run.

### Skipping flaky tests.

Flaky tests are managed in one place, the root `.test_patterns.yml` file. For example:

```yaml
  - regex: "barretenberg/cpp/scripts/run_bench.sh wasm bb-micro-bench/wasm/ultra_honk"
    error_regex: "Aborted.*core dumped"
    owners:
      - *adam
```

Each entry's `regex` is matched against the test command. A matching failure alerts the listed owners in Slack (#aztec3-ci) instead of failing the build. With `error_regex`, only failures whose output matches are treated as flakes. `skip: true` disables a test outright; reserve it for tests that fail constantly. A failing test with no matching owner fails the build.

If you hit a flaky test, add an entry here and notify the owning team.

### Fixing flaky tests.

To reproduce a flaky test, take its line from `test_cmds` and run it repeatedly. The examples below use `barretenberg/cpp/scripts/run_test.sh <binary> <filter>`.

#### Single threaded grind.

```
while barretenberg/cpp/scripts/run_test.sh <binary> <filter>; do true; done
```

This runs the test until it fails.

#### Parallel grind.

If the test is slow but not resource-heavy, use `parallel`. This example runs it 10 times in parallel and stops on the first failure:

```
seq 1 10 | parallel --bar --halt now,fail=1 "barretenberg/cpp/scripts/run_test.sh <binary> <filter> >/dev/null"
```

This discards stdout and assumes that a real error writes to stderr.

#### Remote grind.

For a heavy test, use an EC2 instance rather than the mainframe. `ci grind-test` grinds one test command on a fresh instance:

```
ci grind-test "<hash> <test command>" [timeout] [jobs_pct] [memsuspend_pct] [commit]
```

Or get a shell on a fresh instance and run `parallel` there:

```
ci shell-new
./bootstrap.sh
seq 1 64 | parallel --bar --halt now,fail=1 "barretenberg/cpp/scripts/run_test.sh <binary> <filter> >/dev/null"
```

## Running CI

GitHub Actions runs CI on every push to a non-draft PR (`.github/workflows/ci3.yml`). The flow is `ci3.yml` → `.github/ci3.sh` → `ci.sh <mode>` → `./bootstrap.sh ci-<mode>` on a fresh EC2 instance. `.github/ci3_labels_to_env.sh` picks the mode from the PR labels (see below); the default is `fast`.

To stop CI running on every push, mark the PR as draft:

```
ci draft
```

To go back to ready:

```
ci ready
```

A CI run (`./bootstrap.sh ci-fast`, `ci-full`, ...):

- Uses the build cache.
- Turns on denoising (you'll see lots of dots in the happy path with redis cache ids, and logs only for errors).
- Sets `CI=1`, which makes things like yarn installs immutable.
- Builds with `make` and runs the test engine in parallel with it.

The merge queue into `next` runs `ci-full-no-test-cache` on amd64 plus `ci-fast` on arm64 (`ci.sh merge-queue`).

### Triggering a run from the terminal

These commands spin up an EC2 instance for your current commit, which must be pushed:

| Command | What it runs |
| --- | --- |
| `ci fast` | `./bootstrap.sh ci-fast`: the default PR run, with build and test caches. |
| `ci full` | `./bootstrap.sh ci-full`: the full build and test set, with the test cache. |
| `ci full-no-test-cache` | `./bootstrap.sh ci-full-no-test-cache`: every test runs, as in the merge queue. |
| `ci barretenberg` | Barretenberg-only CI. |
| `ci merge-queue` | The merge-queue jobs. |
| `ci grind` | Parallel `ci-full-no-test-cache` runs (default 5). |
| `ci grind-test` | One test command, ground on one instance. |
| `ci shell-new` | A fresh instance with the repo cloned, and a shell on it. |
| `ci shell-container`, `ci shell-host` | A shell in a running build container or host. |
| `ci kill` | Terminates running build instances for the current branch (or matching filter tokens). |
| `ci dash` | A dashboard of your CI runs. |

Run `./ci.sh help` for the full list. To also skip the build cache, prefix with `NO_CACHE=1`.

## CI Labels and Automation

### Pull Request Labels

Labels read by `.github/ci3_labels_to_env.sh` and `.github/workflows/ci3.yml`. Use at most one mode label.

Mode labels:

- **`ci-full`**: Full CI run instead of the default fast run.
- **`ci-full-no-test-cache`**: Full CI run with the test cache off, so every test runs.
- **`ci-merge-queue`**: Runs the merge-queue jobs on your PR.
- **`ci-barretenberg`**: Barretenberg-only CI. This is also the default for PRs into `merge-train/barretenberg`.
- **`ci-barretenberg-full`**: Full barretenberg-only CI.
- **`ci-release-pr`**: Creates and pushes a release tag (`v0.0.1-commit.<sha>`) for the PR head instead of running CI, then removes the label.

Other labels:

- **`ci-skip`** (or `--ci-skip` in the head commit message): Skips CI. Takes precedence over every other label.
- **`ci-refresh-chonk`** (or `--ci-refresh-chonk` in the head commit message): Regenerates the pinned Chonk inputs and pushes the diff instead of running the main CI. Cannot be combined with a mode label.
- **`ci-no-fail-fast`**: Continues running all tests even if some fail.
- **`no-cache`**: Disables the build cache for this run.
- **`ci-skip-compat-e2e`**: Skips the backwards-compatibility e2e checks on release runs.
- **`ci-draft`**: Runs CI on a draft PR.
- **`ci-ssm`**: Uses SSM instead of SSH to reach the build instance, when the repository is configured for SSH.
- **`ci-squash-and-merge`**: After CI passes, squashes the PR into a single commit and enables auto-merge. The label is removed before squashing. Thanks to the content-based cache (see below), the CI run on the squashed commit is skipped.
- **`ci-wakeup-pr-after-merge`**: Added by `scripts/merge-train/wakeup-prs.sh` after a merge train lands, to re-run CI on waiting PRs. `ci3.yml` removes it at the start of the run.

### Top-level Content-Based CI Caching

On top of the build and test caches, CI caches success by content. When CI completes successfully, `.github/ci3_success.sh` stores a success marker keyed by the CI mode and the hash of the repository's file tree (`git rev-parse HEAD^{tree}`). On the next run in the same mode with the same tree hash, `.github/ci3.sh` skips CI entirely. Only the `fast`, `full`, `full-no-test-cache` and `barretenberg` modes use this cache, and only on the first attempt of a run.

This is useful when:

- You squash commits using `ci-squash-and-merge`: the resulting single commit has the same content, so CI won't re-run.
- You rebase without changes: if the final content is identical, CI is skipped.
- Multiple PRs have identical changes: only the first needs to run CI.

## Denoise Logs

When a CI run has a redis cache available, you will see logs like this:

```
--- pull submodules ---
Executing: git submodule update --init --recursive
   0 ........................................... done (7s) (http://ci.aztec-labs.com/e6b8532f0c020b44)
```

The ids after the run time are log ids. Click the link to open the log in your browser, or view the log in the terminal (for grepping etc) with:

```
ci dlog e6b8532f0c020b44
```

This opens the log in your `PAGER` (usually `less`). If the job failed, the log was also printed in the terminal it ran in.

With the aliases above, you can also run:

```
dl e6b8532f0c020b44
```

A test run log looks like this:

```
Starting parallel run with max 64 jobs...
PASSED (http://ci.aztec-labs.com/736ae186bdf66226): barretenberg/cpp/scripts/run_test.sh <binary> <filter>
...
```

The log id in each line opens the full log of that test. After the colon is the command that ran; run it from the repository root to run the same test.

Every unit test runs individually, with a few exceptions where it is not worth it (for example `l1-contracts`).

## Cache

Read this section if you change the CI scripts or the artifacts a project builds.

Every project has a "build hash", computed by `cache_content_hash`. Its arguments are filenames (for example `.rebuild_patterns`) or patterns. The patterns match the files that make up the artifact being built and cached. If the patterns are wrong, artifacts do not rebuild when they should, or rebuild when they should not.

Some projects also have a "test hash". It decides whether a test must re-run, so it can include files that are not part of the build hash but are used in testing.

Example: `barretenberg/acir_tests/bootstrap.sh`.

- The build hash (of the compiled test programs) combines `../../noir/bootstrap.sh hash` with `cache_content_hash ./.rebuild_patterns ../cpp/.rebuild_patterns ../noir/`.
- The test hash combines the same noir hash, `../cpp/bootstrap.sh hash`, and `cache_content_hash ^barretenberg/acir_tests/ ./.rebuild_patterns ../ts/.rebuild_patterns ../noir/`. It adds barretenberg's C++ and TypeScript code because both run the tests.

After a test passes in CI, it does not run again until its redis key changes. The key is the whole test line, test hash plus command:

```
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates
```

Labs test commands come through `labs/`, prefixed with `cd labs`.

Test-success markers expire after 7 days. Logs expire after 14 days in CI (2 days for local runs).

### The build cache is corrupt. How do I overwrite a cache entry?

In the project directory, rebuild without the cache and force the upload:

```
NO_CACHE=1 S3_FORCE_UPLOAD=1 ./bootstrap.sh
```

This rebuilds the project and replaces the cache entry for its current hash. It needs AWS credentials; without them, the upload is skipped.

## Build Image / Devcontainer

All work happens in a single environment, defined in `build-images/src/Dockerfile`. It publishes 3 images:

- `build` - No developer tooling. Used in test runs to isolate tests.
- `devbox` - `build` plus development tools. This is the official devcontainer.
- `sysbox` - Like `devbox`, but built to run on the internal mainframe under the sysbox runtime.

`build-images/bootstrap.sh` builds the images and pushes them to Docker Hub. It also updates the AWS AMIs, which embed the build and devbox images so instances do not have to pull them. See [build-images/README.md](build-images/README.md).
