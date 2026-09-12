# Build System

This repository uses a custom build system that is **agnostic to CI platforms** and **leverages a remote cache** for build artifacts, logs and test results. Our approach enables efficient incremental builds, distributed parallel testing, and consistent deployment to ephemeral infrastructure (e.g., AWS Spot Instances).

We avoid heavy CI vendor lock-in by using shell scripts with a uniform framework (ci3 folder). Each project defines its own bootstrap or build script but relies on the shared `ci3` folder for advanced features like:

- Generating **content hashes** to skip unchanged builds
- Uploading/downloading build artifacts
- Parallelizing & caching test results
- Logging ephemeral output
- Provisioning ephemeral AWS instances for maximum compute at minimal cost

## Requirements & Rationale

1. **Monorepo-friendly**
   Multiple projects within one repository can have separate build steps that only rebuild if their subset of files changes.

2. **Remote Caching**
   Build artifacts, logs and the test cache go through one small HTTP API, [`CI3_SERVER_API.md`](CI3_SERVER_API.md), via `ci3_client`. Set `CI3_SERVER` to select an endpoint and `CI3_PASSWORD` for production authentication. Local bootstrap starts a file-backed server when no endpoint is set and exports its URL to child processes. Other commands use the exported endpoint or disable logging and remote caching. CI entry points require an endpoint and valid credentials; the workflows select production. The local server redirects artifact misses to the public HTTPS build cache.

3. **Content-based Rebuilds**
   We compare content-hashes of relevant files. If no changes, no rebuild. This encourages fine-grained patterns (e.g., ignoring docs changes, but not ignoring new code).

4. **Ephemeral Infrastructure**
   We frequently run on EC2 spot instances to take advantage of cost savings. On eviction, the system gracefully shuts down and requeues tasks if needed.

5. **Avoiding CI Lock-In**
   We do *not* rely on special vendor features. Our build is run via shell scripts that can be triggered on any platform.

## Important Concepts

### Content Hashes
Instead of tagging artifacts by commit or branch, we compute a hash of the actual files that matter (via `.rebuild_patterns`). If code, dependencies, or scripts in that set change, we produce a new content hash and thus trigger a fresh build.

### CI-Agnostic
All logic is in shell scripts, grouped under the **ci3** folder. A minimal layer of environment detection handles toggling debug modes, caches, or ephemeral logs. This means the same build system can run on local machines, ephemeral Docker containers, or GitHub Actions.

### Rebuild Patterns
Each project folder often contains a `.rebuild_patterns` file. This file has patterns that, if matched by changed files, triggers a new build. Typical patterns might include: `^barretenberg/cpp/src/.*.cpp` and other patterns from root.

When `cache_content_hash` sees new changes in these paths, it regenerates a new hash which prevents a cache download until an S3 artifact with that hash is uploaded.

### Tools

Tools are provided for the following themes.

1. **Caching**
   - **`cache_content_hash`**: Takes file patterns (or `.rebuild_patterns`) to compute a stable content hash.
   - **`ci3_client artifact_upload <name> <paths>...`, `ci3_client artifact_download <name> [directory]`**: Pack and restore `.tar.gz` or `.zst` build artifacts using Python 3.14+ standard-library compression. The server handles storage and redirects. Local runs upload too (a week's retention under `/tmp/ci3`); `NO_CACHE_UPLOAD=1` skips it.
     The file server can also retain public downloads: start it with `CI3_CACHE_PUBLIC=1` or `--cache-public`. By default, public reads are redirected without retaining a copy.
   - **`ci3_client <command>`**: The API client: `log_put/log_put_partial/log_get/log_list/url`, `kv_get/kv_set`, `list_push/list_get`, `run_put/run_get`, and `artifact_upload/artifact_download/artifact_exists`. Raw artifact transfers use `artifact_put/artifact_get`.
     Requires Python 3.14+ with `compression.zstd`; root `./bootstrap.sh install_deps` installs it. CI runners and build images provide it.
   - **`ci3_client check`**: Explicitly verifies the selected endpoint and authentication, and prints setup instructions when no URL is set. Bootstrap and CI entry points run it before proceeding.
   - **`ci3_server`**: The file-backed reference server (`start`, `stop`, `status`, `run`) a local run uses. In CI the server is the labs dashboard (`ci.aztec-labs.com`), which serves the same API.

2. **Test Parallelization & Caching**
   - **`parallelize`**: Reads test commands from STDIN, executes in parallel, aggregates logs.
   - **`run_test_cmd`**: Single test runner that can skip tests cached as “already passed.”
   - **`filter_cached_test_cmd`**: Filters out test commands known to have succeeded (the test cache on the ci3 server).

3. **Ephemeral Logging**
   - **`denoise`**: Minimizes output spam; prints dots for each line, reveals full logs only if a command fails.
   - **`cache_log`**, **`dump_fail`**: Captures output into a log on the ci3 server and prints or reveals logs when needed. `./ci.sh log <id>` reads one back.

4. **AWS Provisioning**
   - **`aws_request_instance`** & **`aws_terminate_instance`**: Provision ephemeral spot or on-demand instances.
   - **`aws_handle_evict`**: Detects spot-instance eviction signals, handles graceful shutdown or requeue.

5. **Docker Isolation**
   - **`docker_isolate`**: Executes a script in a new Docker container with ephemeral volumes, isolating host environment from side effects.

6. **General Utilities**
   - **`source_bootstrap`, `source_refname`, `source_color`**: Shared environment, color-coded logging, or version detection.
   - **`echo_header`**: Prints a heading for better log readability.
   - **ci3/source** is the central include-script for Aztec’s build system, automatically configuring Bash strict mode, setting up your `$PATH` to include all ci3 utilities (e.g. caching, parallel test commands), and providing helper functions and color-coded logging. Simply add source `$(git rev-parse --show-toplevel)/ci3/source` at the top of any project script to inherit a robust, preconfigured environment.

### Usage Flow

1. **In each project**: A `bootstrap.sh` might:
   - Call `cache_content_hash` to detect changes.
   - If changed, do the relevant compile step, then `ci3_client artifact_upload`.
   - If not changed, do `ci3_client artifact_download` to restore a previously built artifact.

2. **In test scripts**:
   - We gather test commands (`test_cmds`) in a form easily read by `parallelize`.
   - `parallelize` calls `run_test_cmd` on each line, skipping or running tests as needed.

3. **In local or ephemeral servers**:
   - Either manually run `./bootstrap.sh fast` or let the CI invoke it on a fresh machine.
   - The system pulls dependencies, attempts to restore from remote caches, rebuilds only if necessary, then parallelizes tests.

4. **On success**:
   - Artifacts can be re-uploaded or flagged as “passed,” letting future runs skip unchanged steps.
