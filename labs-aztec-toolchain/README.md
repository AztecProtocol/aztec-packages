Owns where the binaries labs components build with come from, so those components work the same in the monorepo and in a split labs repo.

`bootstrap.sh` pins a bb and a noir version and provisions `bin/`: `bb` via bbup, `nargo`/`noir-profiler` via noirup, `bb-avm` from its own release artifact (amd64 linux only), and `acvm` compiled from the noir release source, since nothing publishes it. `bin/.pin` records what was installed and is what makes a re-run incremental.

Consumers take `NARGO`/`BB` from `bin/`, the toolchain identity from `bootstrap.sh hash` (for cache keys), and the pinned noir version from `bootstrap.sh noir_version`.
