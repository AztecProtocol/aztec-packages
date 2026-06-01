window.BENCHMARK_DATA = {
  "lastUpdate": 1780312612297,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Spartan": [
      {
        "commit": {
          "author": {
            "name": "Gregorio Juliana",
            "username": "Thunkar",
            "email": "gregojquiros@gmail.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "8f347013715ffd75afb7c4070fd10f38d1fa85e8",
          "message": "fix: include standard-contracts artifacts in release image (#23753)\n\n## Problem\n\nV5 / `next` net deployments crash on startup with:\n\n```\nError [ERR_MODULE_NOT_FOUND]: Cannot find module\n'/usr/src/yarn-project/standard-contracts/artifacts/AuthRegistry.json'\nimported from /usr/src/yarn-project/standard-contracts/dest/auth-registry/index.js\n```\n\n## Root cause\n\n`release-image/Dockerfile.dockerignore` is an allowlist (`*` ignores\neverything, then `!`-includes specific paths). It explicitly re-includes\nthe `artifacts/` directory for `protocol-contracts`,\n`noir-contracts.js`, `accounts`, `simulator`, etc., and copies every\n`dest/` via `!/yarn-project/*/dest/` — but it has **no** entry for\n`standard-contracts/artifacts/`.\n\nWhen auth-registry (and later public-checks / multi-call-entrypoint) was\ndemoted into the new `standard-contracts` package (#23106), the\nallowlist was never updated. So the image ships\n`standard-contracts/dest/` but not its artifacts. At container startup\nthe eager import in `dest/auth-registry/index.js` (`import\n'../../artifacts/AuthRegistry.json'`) resolves to a file that was\nexcluded from the build context → `ERR_MODULE_NOT_FOUND`.\n\nThis only affects the **Docker release image**. The npm tarball is\nunaffected because it uses `package.json`'s `files` field (which\nincludes `artifacts`), a different mechanism — which is why `npm pack\n@aztec/standard-contracts` contains `AuthRegistry.json` while the\ndeployed image does not.\n\n## Fix\n\nAdd `standard-contracts/artifacts/` to the dockerignore allowlist,\nmatching the other contract-artifact packages. One line; same pattern as\nthe existing `protocol-contracts`/`noir-contracts.js` entries.\n\n## Verification\n\n- `npm pack @aztec/standard-contracts@latest` already contains\n`artifacts/AuthRegistry.json`, `PublicChecks.json` (confirms\nsource/files are correct; the gap is image-only).\n- After this change the dockerignore re-includes\n`standard-contracts/artifacts/`, so the JSON artifacts are copied to\n`/usr/src/yarn-project/standard-contracts/artifacts/` alongside `dest/`,\nresolving the eager import.\n\n---\n*Created by\n[claudebox](https://claudebox.work/v2/sessions/b19bc30b22f7bbf3) ·\ngroup: `slackbot`*",
          "timestamp": "2026-05-31T18:04:58Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f347013715ffd75afb7c4070fd10f38d1fa85e8"
        },
        "date": 1780309982548,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "yarn-project/end-to-end/proven_1tps/successful_txs",
            "value": 832,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proof_duration",
            "value": 273.319,
            "unit": "s"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/active_agents",
            "value": 1,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/avg_queue_time",
            "value": 53698.230151650314,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/job_retries",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/job_duration",
            "value": 22927.36287923855,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/timed_out_jobs",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/resolved_jobs",
            "value": 3362,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/rejected_jobs",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/epoch_proving_duration",
            "value": 406.6566435010005,
            "unit": "s"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proven_transactions",
            "value": 12,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proven_blocks",
            "value": 32,
            "unit": "count"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Gregorio Juliana",
            "username": "Thunkar",
            "email": "gregojquiros@gmail.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "8f347013715ffd75afb7c4070fd10f38d1fa85e8",
          "message": "fix: include standard-contracts artifacts in release image (#23753)\n\n## Problem\n\nV5 / `next` net deployments crash on startup with:\n\n```\nError [ERR_MODULE_NOT_FOUND]: Cannot find module\n'/usr/src/yarn-project/standard-contracts/artifacts/AuthRegistry.json'\nimported from /usr/src/yarn-project/standard-contracts/dest/auth-registry/index.js\n```\n\n## Root cause\n\n`release-image/Dockerfile.dockerignore` is an allowlist (`*` ignores\neverything, then `!`-includes specific paths). It explicitly re-includes\nthe `artifacts/` directory for `protocol-contracts`,\n`noir-contracts.js`, `accounts`, `simulator`, etc., and copies every\n`dest/` via `!/yarn-project/*/dest/` — but it has **no** entry for\n`standard-contracts/artifacts/`.\n\nWhen auth-registry (and later public-checks / multi-call-entrypoint) was\ndemoted into the new `standard-contracts` package (#23106), the\nallowlist was never updated. So the image ships\n`standard-contracts/dest/` but not its artifacts. At container startup\nthe eager import in `dest/auth-registry/index.js` (`import\n'../../artifacts/AuthRegistry.json'`) resolves to a file that was\nexcluded from the build context → `ERR_MODULE_NOT_FOUND`.\n\nThis only affects the **Docker release image**. The npm tarball is\nunaffected because it uses `package.json`'s `files` field (which\nincludes `artifacts`), a different mechanism — which is why `npm pack\n@aztec/standard-contracts` contains `AuthRegistry.json` while the\ndeployed image does not.\n\n## Fix\n\nAdd `standard-contracts/artifacts/` to the dockerignore allowlist,\nmatching the other contract-artifact packages. One line; same pattern as\nthe existing `protocol-contracts`/`noir-contracts.js` entries.\n\n## Verification\n\n- `npm pack @aztec/standard-contracts@latest` already contains\n`artifacts/AuthRegistry.json`, `PublicChecks.json` (confirms\nsource/files are correct; the gap is image-only).\n- After this change the dockerignore re-includes\n`standard-contracts/artifacts/`, so the JSON artifacts are copied to\n`/usr/src/yarn-project/standard-contracts/artifacts/` alongside `dest/`,\nresolving the eager import.\n\n---\n*Created by\n[claudebox](https://claudebox.work/v2/sessions/b19bc30b22f7bbf3) ·\ngroup: `slackbot`*",
          "timestamp": "2026-05-31T18:04:58Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f347013715ffd75afb7c4070fd10f38d1fa85e8"
        },
        "date": 1780312611155,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "yarn-project/end-to-end/proven_1tps/successful_txs",
            "value": 832,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proof_duration",
            "value": 273.319,
            "unit": "s"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/active_agents",
            "value": 1,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/avg_queue_time",
            "value": 53698.230151650314,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/job_retries",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/job_duration",
            "value": 22927.36287923855,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/timed_out_jobs",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/resolved_jobs",
            "value": 3362,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/rejected_jobs",
            "value": 0,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/epoch_proving_duration",
            "value": 406.6566435010005,
            "unit": "s"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proven_transactions",
            "value": 12,
            "unit": "count"
          },
          {
            "name": "yarn-project/end-to-end/proven_1tps/proven_blocks",
            "value": 32,
            "unit": "count"
          }
        ]
      }
    ]
  }
}