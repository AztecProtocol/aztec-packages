# ci3

`ci3/` holds the shell tools behind the aztec-packages build, cache and test system. Project `bootstrap.sh` scripts source them to hash their inputs, upload and download build artifacts, run tests in parallel with a shared test cache, store logs, and run CI on EC2 instances. The same scripts run on a laptop, in the devbox container and in CI; GitHub Actions only calls into them. The remote build cache is in S3 (MinIO is used only in ci3's own tests).

For usage (building, running tests, triggering CI, labels, logs, cache), see [CI.md](../CI.md).

## Concepts

- **Content hashes.** Artifacts are keyed by a hash of the files that make them up, not by commit or branch. `cache_content_hash` computes it from patterns, usually a project's `.rebuild_patterns` file (for example `^barretenberg/cpp/src/.*.cpp`). A change to a matched file produces a new hash, so the cached artifact is not downloaded and the project rebuilds.
- **Test commands.** Each project prints its tests with `test_cmds`, one line per test: `<test hash> <command run from the repository root>`. The root `Makefile` `*-tests` targets append these lines to `/tmp/test_cmds`, and `test_engine` runs them as they arrive.
- **Test cache.** After a test passes, `run_test_cmd` records the whole line in redis for 7 days. `filter_cached_test_cmd` drops lines that already passed.

## Tools

Only the main tools are listed; see `ls ci3` for the rest.

| Group | Tools |
| --- | --- |
| Sourcing | `source` (strict mode, `PATH` with all ci3 tools, helper functions; add `source $(git rev-parse --show-toplevel)/ci3/source` at the top of a script), `source_bootstrap` (for project `bootstrap.sh` scripts, adds the default command handler), `source_redis`, `source_cache`, `source_refname`, `source_color` |
| Build cache | `cache_content_hash`, `cache_upload`, `cache_download`, `cache_exists`, `cache_delete` |
| Tests | `filter_test_cmds` (drops `skip: true` entries from the root `.test_patterns.yml`, then cached tests), `filter_cached_test_cmd`, `parallelize`, `run_test_cmd`, `test_engine`, `grind_test`, `get_test_owner` |
| Logs | `denoise` (prints dots per output line and the full log only on failure), `cache_log`, `dump_fail`, `color_prefix`, `echo_header` |
| EC2 | `bootstrap_ec2` (requests an instance, runs a command in the devbox container on it, handles spot termination), `aws_request_instance`, `aws_terminate_instance`, `watch_ci` |
| Docker | `docker_isolate` (runs a command in a container with its own network stack and CPU, memory and tmpfs limits, with the repository mounted as-is) |
| Dashboard | `dashboard/` (the CI dashboard at `ci.aztec-labs.com`) |
