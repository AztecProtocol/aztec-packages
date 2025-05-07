# CI3

This document attempts to document CI version 3, to provide a little history, rationale, and a guide on how to use it.

If anything is unclear or lacking, raise it with me (Charlie) directly, so I can advise and update this document.

There were two prior CI systems.

- `CI1` was a collection of bash scripts that leant heavily into the use of cli tools. It strived to be vendor agnostic, stateless on actual build instances, and had a docker centric workflow whereby each project had it's on Dockerfile.
- `CI2` attempted to use a product called Earthly to provide a "merged" bash/Dockerfile syntax, maintaining the Docker centric workflow, but also requiring build instances to have state.

CI3 is a reversion to the philosophy of CI1, but removing the Docker centric workflow that required every project to have it's own Dockerfile.

CI3:

- Is vendor agnostic. That means the amount of GA config is kept to an absolute minimum, and strives to provide a feature-full CI experience direct from the terminal (minus code reviews etc).
- Simply executes commands that a developer would be executing, and within exactly the same environment. Thus it is implicitly testing our development container and bootstrap scripts.
- Is stateless on build instances, however whereas CI1 pushed and pulled containers from a registry, CI3 uploads/downloads artifacts from an S3 bucket.
- Uses docker "only" for:
  - Building the development container in `build-images`.
  - Running the bootstrap in CI in the development container.
  - Isolating any tests that require use of the network stack.
  - Restricting resources such a vcpus, memory and storage.
  - Building a single final slim release image from `release-image`.
- Provides a consistent command interface on `./bootstrap.sh` scripts, e.g. `./bootstrap.sh clean|fast|full|test|test_cmds`.
- Unifies how projects are tested allowing for a "build then test the entire repo" workflow. Projects expose their individual tests via `test_cmds` and they can all be parallelised at once to leverage maximum system throughput.
- Runs on a single (currently large, 128 vcpu) machine.
- Significantly reduces the chance of flakey tests making their way into master, by "grinding" the tests in the master merge queue. This simply executes the tests as above, but across N instances. (TBD)
- Provides a shared redis cache at the test level, meaning the same test never needs to be run twice in CI (except when grinding).
- Aims to reduce log noise significantly, only displaying logs that errored by default, while still storing all logs in a shared redis cache. Developers can "drill-down" into logs via log ids.
- Aims to reduce repository clutter significantly. Ultimately, outside of the `ci3` folder itself, we shouldn't need more than a handful of bootstrap scripts, run_test scripts, and maybe a handful of exceptional helper scripts.

## The Scripts

CI3 aims to be clutter free. These are the main scripts to be aware of:

- `/ci.sh` - For all CI related workflow such as triggering CI runs, tailing logs, getting historical logs, running on remote machines with different architectures, etc.
- `/bootstrap.sh` - Root bootstrap script. Can build, test and deploy the entire repository.
- `/**/bootstrap.sh` - Project specific bootstrap scripts. Follow common patterns such as allowing fetching of test commands. Where possible _everything needed to **bootstrap, test, and release** the project should be in this one script_. There maybe some exceptions but we want "locality of behaviour".
- `/**/scripts/run_test.sh` - Each project has such a script that, given arguments, can run a _single_ test. The test commands returned by `./bootstrap test_cmds` will usually be calling this script in each project.

As a general philosophy, do not be creating random little scripts to aid in your workflow. I'd be happy to hear what workflow problems you're having, and we can look at updating the existing bootstrap scripts to better support it.

Some bootstrap scripts provide project specific entrypoints. e.g. `noir-contracts` offers a compile command:

```
./bootstrap.sh compile <contract-name>
```

It's worth looking at the scripts to see what commands they export. They are all neatly expressed at the bottom of each script.

## Getting Started

You can do yourself a small favour and add the following aliases to your `~/.zshrc`. The following documentation will assume they're there.

```
alias ci='$(git rev-parse --show-toplevel)/ci.sh'
alias dl='$(git rev-parse --show-toplevel)/ci.sh dlog'
```

This will enable running the ci script simply with `ci <cmd>`, and being able to view denoised logs with `dl <id>`.

### Getting the repository into a runnable state.

After cloning the repository, run:

```
./bootstrap.sh
```

This is the same as running:

```
./bootstrap.sh fast
```

A fast bootstrap will use the S3 cache to get the repository into a runnable state as fast as possible.

If you want to build everything from scratch and not use the cache:

```
./bootstrap.sh full
```

After running any of the above, you should have a fully runnable repository, including being able to run all the tests. If something doesn't run without further intervention, something's wrong and you should let me know.

### Cleaning the repo.

Shouldn't be needed often. If you find yourself needing it to work around issues, let me know.

```
./bootstrap.sh clean
```

This erases untracked files, submodules, etc. Use with caution locally.

### Running tests.

You should be able to just do:

```
./bootstrap.sh test
```

However this will run _the entire repository test suite_. This isn't recommended unless you have a very powerful machine or a lot of patience. I would rather you didn't do this on the mainframe at present as if several users do it at once it could cause issues.

You can provide one or more projects (a folder with another `./bootstrap.sh` script) as arguments. e.g.

`./bootstrap.sh test yarn-project boxes`

This will run the tests for `yarn-project` and `boxes`.

Tests for all projects are run in parallel. At present it's limited to half the number of vcpus (usually the number of physical cores).

### Test commands.

To see the test commands that are run for a given project, run:

```
./bootstrap.sh test_cmds
```

The test commands are filtered to not include matching patterns in the root `.test_skip_patterns` file.

You can run this in the root to see all test commands, or provide project folders as arguments, or run it directly in a project folder. You might want to make sure this reflects what you expect when you add tests. Generally you shouldn't have to worry about it, the scripts are automated enough to find the tests if you're following the usual patterns. You'll get something like:

```
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates_with_shifts
699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_boolean_gates
```

Note the first field before the actual command is the "test hash" discussed further below.
The actual command can be run from the root of the repo to run the test manually.

Also note that all projects tend to have a `scripts/run_test.sh` which is the actual test runner script that can take the project specific arguments and translate them into a test run.

### Skipping flakey tests.

These are now managed in a single place, the file in the repository root `.test_skip_patterns`. Note the following examples:

```
# noir
noir_lsp-.* notifications::notification_tests::test_caches_open_files
noir_lsp-.* requests::

# noir-contracts
# "The number -0.000015046493062592755 cannot be converted to a BigInt because it is not an integer"
counter_contract Counter::extended_incrementing_and_decrementing
```

Note you can add comments using `#`. Otherwise lines are regexes that are used by `grep` to filter the `test_cmds`. This allows us to clearly see and manage which tests are currently disabled due to flakey behaviour.

If you run into a flakey test (which should be _much_ less common once the grinder is running), disable it here and notify the relevant team.

Note that as node test commands are limited to the entire test file, you _may_ still want to go add `.skip` directives instead, but if one test in a suite is flakey, they probably all are (or the suite is too big).

### Fixing flakey tests.

If you're responsible for resolving a flakey test, there's a few approaches you can take.
Let's assume you're trying to reproduce the flake error on `yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network`.

#### Single threaded grind.

```
while yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network; do true; done
```

Simple runs the test over and over again until it fails.

#### Parallel grind.

If that's too slow as the test takes a while to run, and the test itself is not too "heavy", you can use parallel.
This example runs it 10 times in parallel and stops on first failure.

```
seq 1 10 | parallel --bar --halt now,fail=1 "yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network >/dev/null"
```

This swallows stdout so it doesn't spam your terminal, and assumes that an actual error would produce output on stderr.

#### Remote parallel grind.

If the test is quite a heavy test, you may need further compute resource (and you should be mindful not to cripple mainframe for other users). You can get an EC2 128 vcpu system for an hour and run parallel there.

```
ci ec2-shell
./bootstrap.sh
seq 1 64 | parallel --bar --halt now,fail=1 "yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network >/dev/null"
```

## CI

At present CI will run in Github Actions for all the usual PR triggers (pushing etc). This may change in the future to require explicit triggers. In the meantime if you don't want CI constantly running your PR (and assuming your branch _has_ a PR) you can disable automatic runs with:

```
ci draft
```

You can go back to ready with:

```
ci ready
```

A CI run is really just running `./bootstrap.sh ci`. This:

- Enables use of the build cache.
- Turns on denoising (you'll see lots of dots in the happy path with redis cache ids, and logs only for errors).
- Sets the `CI=1` environment variable which makes things like yarn immutable.

There are several notable ways you can trigger a CI run:

### Your latest commit, on local hardware.

The following starts a container, clones your latest commit into it, and starts a CI run.

```
ci local
```

### Your latest commit, on a fresh 128 cpu ec2 instance.

This is useful for CI development work where you just don't care about Github Actions at all.
This is exactly what GA itself calls.

```
ci ec2
```

This will also have the test cache enabled, meaning successfully run tests won't be re-executed unless they've changed. If you want to disable the test cache to see a run with all tests.

```
ci ec2-test
```

If you want a run that uses neither the build cache nor the test cache:

```
ci ec2-no-cache
```

### Your latest commit, triggered within Github Actions on your PR.

This might replace auto-runs on push in the future, but you can manually start a run with:

```
ci trigger
```

This will start an asynchronous run, but you can track the log right in your terminal with:

```
ci rlog
```

This will also show the last completed log if the run has already completed. You can provide a GA run id (output by `ci trigger`) to see a historical run.

## Denoise Logs

When a CI run is taking place and it has a redis cache available, you will see logs like this:

```
--- pull submodules ---
Executing: git submodule update --init --recursive
   0 ........................................... done (7s) (http://ci.aztec-labs.com/e6b8532f0c020b44)
--- noir build ---
Executing: ./noir-repo/.github/scripts/wasm-bindgen-install.sh
   0 .......................................... done (3s) (http://ci.aztec-labs.com/cf3cc1cde7f5dbc0)
```

The ids after the time-to-run are log ids. You can click the link (might need you to hold down special keys in your terminal) to open the log in your browser, or you can view the log in terminal (for grepping etc) with e.g.:

```
ci dlog e6b8532f0c020b44
```

This will open the log in whatever your `PAGER` is set to, usually `less`. If the job failed, the log will also have been dumped out in the terminal it was running in.

Assuming you added the aliases as suggested, you can also just do:

```
dl e6b8532f0c020b44
```

Let's say you open up a test run log, you'll see something like:

```
Command: parallelise 64 (exit: 0)
Starting test run with max 64 jobs...
PASSED (http://ci.aztec-labs.com/736ae186bdf66226): yarn-project/end-to-end/scripts/run_test.sh simple e2e_synching
PASSED (http://ci.aztec-labs.com/066e837f7af23761): yarn-project/end-to-end/scripts/run_test.sh simple e2e_public_testnet_transfer
PASSED (http://ci.aztec-labs.com/f22e6cf8304765e5): yarn-project/end-to-end/scripts/run_test.sh simple e2e_cheat_codes
PASSED (http://ci.aztec-labs.com/011e2be332519357): yarn-project/end-to-end/scripts/run_test.sh compose composed/e2e_pxe
...
```

You can view the entire log of the successful run of any test using the log id which is the second field. After the colon is the command that was actually run. You can copy and run this command from the root of the repo to run the exact same test.

Every single unit test is run individually - with a notable exception being node tests, where you can only go as granular as a single test file. There are a couple of other small exceptions where it wasn't worth it (e.g. `l1-contracts`).

## Cache

The cache has been referred to a lot. If you're doing work on the scripts or changing the artifacts we build through the repo, it's important to understand some things.

All projects have at least a "build hash". This is computed using `cache_content_hash`. It takes as arguments either filenames (e.g. `.rebuild_patterns`) or patterns themselves. These patterns match files in the repository that "make up" the artifact being built and cached. Obviously if these are wrong, you can get into a pickle as things won't rebuild when they're expected to, or will aggressively rebuild when they shouldn't.

Some projects will also have a "test hash". The test hash is part of the input to deciding if a test should be re-run. So this might also include files that don't make up the build hash, but are used as part of testing.

To give a concrete example, take `barretenberg/acir_tests`. Here we have a build hash that consists of what makes up `nargo` (`../../noir/.rebuild_patterns` and `../noir/.noir-repo.rebuild_patterns`, but do make use of `../../noir/bootstrap.sh hash` to compute it correctly), and the test programs themselves (`../../noir/.noir-repo.rebuild_patterns_tests`) as they are actually compiled using nargo with the results stored in the build cache. The "test hash" then additionally adds barretenbergs cpp and ts code, because both are used in the actual _running_ of the tests.

If a test successfully runs in CI, it won't be run again unless its redis key changes. This key consists of the "test hash" and the "test command". Here's an example:

```
c533d7b87f00f64f ISOLATE=1 yarn-project/scripts/run_test.sh prover-node/dest/prover-node.test.js
```

This is one of the tests output by `./yarn-project/bootstrap.sh test_cmds`. The first field is the test hash, the rest is the command you can run from the repository root. This entire line is what's hashed to make up the redis key.

Note that all cache entries expire after 7 days.

### We've only gone and corrupted the build cache. Can we force a build to overwrite the existing cache entry?

Yes. In the project directory run a full build as follows:

```
S3_FORCE_UPLOAD=1 ./bootstrap.sh full
```

This will perform a full rebuild of the project and forcefully replace the build cache with it's current hash. This should only be necessary if you need to recover from a-bad-thing-happening.

## Build Image / Devcontainer

It's useful to understand a bit about our build image. As a reminder, we have a single environment that we work within. This is defined in `./build-images/Dockerfile`. Within this we describe 3 images that are ultimately used.

- `build` - This doesn't contain any developer tooling, and is used as part of test runs to isolate tests.
- `devbox` - Same as `build`, but also includes a suite of development tools and is our official "devcontainer".
- `sysbox` - Same as `devbox`, but built slightly differently to be used by internal Aztec engineers on our mainframe within Nesty's sysbox runtime.

The images can be built and pushed to dockerhub using the `build-images/bootstrap.sh` script.

It also provides the ability to update our AWS AMI's which have the above build/devbox images embedded within them so we don't have to keep pulling them.

## Release Image

Aztec is released as a _single_ mono-container. That is, everything we need to ship should end up in `aztecprotocol/aztec` and published to Dockerhub with version tags.

The release image is created from a bootstrap, by the `release-image/Dockerfile`. The `Dockerfile.dockerignore` file ensures that only what's needed is copied into the container. We perform a multi-stage build to first strip back to production dependencies, and copy them into a final slim image.

**It is _extremely_ important we keep this image as lightweight as possible. Do NOT significantly expand the size of this image without very good reason.**

## Releases

Release please is used and will automatically tag the commit e.g. `v1.2.3`. The project will subsequently be released under that version.

You can also trigger pre and post releases using extended semver notation such as `v1.2.3-nightly.20250101` or `v1.2.3-devnet.0`. This are made simply by tagging the appropriate master commit.

Releases can be performed directly from the terminal if necessary. However at present this will require `NPM_TOKEN` which is a secret restricted to a few people. In future we may provide a "staging organization" for less secure unofficial releases.

One can also side-step Release Please automation by updating the version number in the root `.release-please-manifest.json`, committing, tagging the repository with e.g. `v1.2.3`, checking out the tag, and running:

```
./bootstrap.sh release
```

This is all that CI does when it wants to perform an official release.

## Q&A

### I can't run `yarn clean` in a yarn-project sub project any more. How to do?

```
yarn-project/bootstrap.sh clean <project_dir>
```

### Where did all the `formatting` and `lint` package.json scripts go?

Performing this at the project level is inefficient, particularly for linting. We can offer a project wide optimal approach with:

```
yarn-project/bootstrap.sh format
```

### Master CI runs do more then PR CI runs. How do I manually trigger that flow?

It's probably best to do this on a fresh ec2 instance rather than crippling your local hardware. You can do:

```
CI_FULL=1 ci ec2-test
```

This will create a new instance, bootstrap, and run all tests that would run on master.

### How does swc compare to tsc (typescript compiler?)

1. swc is stricter than tsc when it comes to hoisting ESM imports. This means that circular dependencies that were not causing issues previously may now do. madge seems like a good tool for spotting them (npx madge --circular path-to-file), since eslint no-circular-imports not always spots them. When dealing with circular deps, keep in mind type imports are removed, so you don't need to worry about those.
2. swc is a lot faster than tsc, but it does not type check. When running bootstrap eg after a rebase, a successful run does not mean the project types are correct. You need to run bootstrap with TYPECHECK=1 for that. If you want to keep a running process that alerts you of type errors, do yarn tsc -b -w --emitDeclarationOnly at the root of yarn project.
3. There is some combination of swc+tsc+jest that breaks things. If you happen to build your project with `tsc -b`, some test suites (such as prover-client or e2e) will fail to run with a parse error. Workaround is to re-build with swc before running tests by running `./bootstrap.sh compile` on yarn-project, and make sure you are not running `tsc -b -w` (or if you do, you set `--emitDeclarationOnly` as described above).

## Contributing

Please involve me (Charlie) in any changes to the scripts that make up CI3. I've added myself as a CODEOWNER to the main scripts and `ci3` folder, so I should at least be reviewing changes. However ideally if you're running into some use-case I've broken, or require some feature, just raise it with me before starting to make changes as I may already be working on it or have an idea about how I want it solved.

Please don't just start adding commands and lots of lines-of-code to these scripts without my approval. I'm working really hard to make these lean, clean, consistent and fast!
