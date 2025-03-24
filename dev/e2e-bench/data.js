window.BENCHMARK_DATA = {
  "lastUpdate": 1742818711698,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "233ca3eb21fdd04ac676f37b21ef4d0b7c74932a",
          "message": "chore(avm): vm2 lazy bytecode loading (#12847)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-03-18T17:05:48Z",
          "tree_id": "8d76e428c46cc3913396ecc13090f10fed566aa5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/233ca3eb21fdd04ac676f37b21ef4d0b7c74932a"
        },
        "date": 1742320092547,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9486,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2314856610836955,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143089,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "eff250193b2a0b75f503cbfd308f57aa7efec274",
          "message": "fix: Remove hack to register contract class directly on node (#12795)\n\nFixes #10007",
          "timestamp": "2025-03-18T18:43:56Z",
          "tree_id": "74ef051b88c8f2b1743bcfd50cd74032ce576617",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eff250193b2a0b75f503cbfd308f57aa7efec274"
        },
        "date": 1742324696062,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9338,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22786299600647314,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132519,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "16536249+LHerskind@users.noreply.github.com",
            "name": "Lasse Herskind",
            "username": "LHerskind"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4f37decb654f3ab0a186fafb0a9a3d0b7d9d00ec",
          "message": "chore: once again skip the uniswap tests (#12859)\n\nSkips the uniswap test in ci again as we deleted that part by mistake in\n#12724",
          "timestamp": "2025-03-18T20:17:54Z",
          "tree_id": "4185932695511d55ff1f42b434aa9775c5f6290b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4f37decb654f3ab0a186fafb0a9a3d0b7d9d00ec"
        },
        "date": 1742330392158,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9437,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23027186126212468,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143177,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fa5991f80fdfb0fbde5fa8062367b339236abe4d",
          "message": "feat(noir sync): Calculate noir hash based on just `noir-repo-ref` and `noir-repo.patch` (#12861)\n\nAlternative to\nhttps://github.com/AztecProtocol/aztec-packages/pull/12858\n\nChanges `noir/bootstrap.sh` to use `cache_content_hash\n.rebuild_patterns` if\n* we have specified an `AZTEC_COMMIT_HASH`, looking for historical\nvalues\n* there are no commits in `noir-repo` that could be added to a patch\nfile, indicating changes that aren't captured by the `.rebuild_patterns`\nand the `noir-repo-ref` file, and\n* `noir-repo` isn't on a _branch_ which could evolve all the time; if\nit's on a branch then use the `.noir-repo.rebuild_patterns` in\n`noir-repo` itself to figure out the hash\n\nThe exception for feature branches should not affect normal aztec\nworkflow, which is based on _tags_, it's only there to support temporary\nwork noir developers do across both repos at the same time, and it's not\nsomething that will be merged into the `master` branch of\n`aztec-packages` (it would defeat repeatable builds).\n\nWith this change it should be possible to use `AZTEC_COMMIT_HASH` to\nquery historical queries, as seen in the 2nd example below.\n\n### Example 1\n\nThis shows that if we're on a tag, then adding a new commit to the\nnoir-repo will disable caching. This is the normal case in\n`aztec-packages`. Otherwise the hash is based on just `noir`. But if we\nswitch to a feature branch, caching is back on to support faster builds,\nincorporating the latest commits into the hash.\n\n```console\n# We are on a tag\n% ./noir/scripts/sync.sh info                                                                                                                                                                        \nRepo exists:              yes\nFixup commit:             9dcbd3fbf47f886821ac71a647d4f9712ab1eb1d\nCheckout commit:          45ad637273cef317eba42feaf2be0e59d34065ed\nWanted:                   nightly-2025-03-18\nNeeds switch:             no\nNeeds patch:              no\nDetached:                 yes\nOn branch:                no\nBranch name:              n/a\nHas wanted tag:           yes\nHas tag commit:           yes\nHas patch commit:         yes\nLast commit is patch:     yes\nHas fixup and patch:      yes\nHas uncommitted changes:  no\nLatest nightly:           nightly-2025-03-18\nCache mode:               noir\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                  \nnoir\n% ./noir/bootstrap.sh hash                                                                                                                                                                           \neb08d2624603de97\n\n# Make a change in the noir-repo\n% cd noir/noir-repo                                                                                                                                                                                  \n% echo \"Foo\" > compiler/foo.txt && git add compiler/foo.txt && git commit -m \"Foo\"                                                                                                              \n[detached HEAD 23d1d2ac6b] Foo\n 1 file changed, 1 insertion(+)\n create mode 100644 compiler/foo.txt\n% cd ../..        \n\n# The extra commit disables the cache\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                  \ndisabled-cache\n% ./noir/bootstrap.sh hash                                                                                                                                                                           \ndisabled-cache\n\n# Now switch to a feature branch\n% echo af/msgpack-codegen > noir/noir-repo-ref                                                                                                                                                       \n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nError: noir-repo is on a detached HEAD and the last commit is not the patch marker commit;\nswitching to af/msgpack-codegen could mean losing those commits.\nPlease use the 'make-patch' command to create a noir-repo.patch file and commit it in aztec-packages, \nso that it is re-applied after each checkout. Make sure to commit the patch on the branch where it should be.\n\n# Get rid of the foo commit, so we can switch away\n% cd noir/noir-repo                                                                                                                                                                                 \n% git reset --hard HEAD~1                                                                                                                                                                       \nHEAD is now at 8b88883d58 Noir local patch commit.\n% cd ../..                   \n\n# Hashing still involves syncing; we need the noir-repo to decide how to hash\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nremote: Enumerating objects: 187, done.\n...\nSwitched to branch 'af/msgpack-codegen'\nYour branch is up to date with 'upstream/af/msgpack-codegen'.\n...\n[af/msgpack-codegen 98f9a3cc43] Noir local fixup commit.\n 4 files changed, 108 insertions(+), 2 deletions(-)\n create mode 100755 acvm-repo/acvm_js/build.sh.bak\n create mode 100755 tooling/noirc_abi_wasm/build.sh.bak\nApplying: patch: delete honk example programs\nApplying: chore: turn on `skipLibCheck`\nApplying: chore: delete leftover file\nApplying: Ignore package.tgz\n[af/msgpack-codegen 182331696a] Noir local patch commit.\ndisabled-cache\n\n# ^ The cache is disabled becase we have a pending change in `noir/noir-repo-ref`, \n# but `cache-mode` indicates we need to cache based on the `noir-repo` contents.\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                 \nnoir-repo\n\n# Commit the noir-repo-ref file, so we have a clean state in aztec-packages                                                                                                                                                                              \n% git add noir/noir-repo-ref && git commit -m \"Switched to a feature branch\"                                                                                                                        \nFormatting barretenberg staged files...\n[af/noir-repo-ref-hash 62fc17a03b] Switched to a feature branch\n 1 file changed, 1 insertion(+), 1 deletion(-)\n\n# Now we hash based on the code in `noir-repo`, *and* the contents of `noir`\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \n798ec85262e6133a\n\n```\n\n### Example 2\n\nThis one shows that even after switching to a different tag, we can use\nthe `AZTEC_CACHE_COMMIT` feature to go back in the commit log to get a\nhistorical hash.\n\n```console\n# We're on a tag\n% git rev-parse HEAD                                                                                                                                                                                \n517f2463281beb3d528662d1fd3d6e5346fdb523\n% cat noir/noir-repo-ref                                                                                                                                                                            \nnightly-2025-03-18\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nbf9bcc2b4f6046c7\n\n# Want to roll back to a previous nightly tag\n% echo nightly-2025-03-11 > noir/noir-repo-ref                                                                                                                                                      \n% git add noir                                                                                                                                                                                      \n% git commit -m \"Roll back nightly\"                                                                                                                                                                 \nFormatting barretenberg staged files...\n[af/noir-repo-ref-hash 858d98f42b] Roll back nightly\n 1 file changed, 1 insertion(+), 1 deletion(-)\n\n# Recalculating the hash will sync the repo, but the hash will be based on the ref, not the content\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nremote: Enumerating objects: 66481, done.\nremote: Counting objects: 100% (61479/61479), done.\nremote: Compressing objects: 100% (36681/36681), done.\nremote: Total 57993 (delta 21540), reused 52084 (delta 16927), pack-reused 0 (from 0)\nReceiving objects: 100% (57993/57993), 158.39 MiB | 33.13 MiB/s, done.\nResolving deltas: 100% (21540/21540), completed with 557 local objects.\nremote: Enumerating objects: 23, done.\nremote: Counting objects: 100% (16/16), done.\nremote: Compressing objects: 100% (3/3), done.\nremote: Total 3 (delta 2), reused 1 (delta 0), pack-reused 0 (from 0)\nUnpacking objects: 100% (3/3), 1.66 KiB | 1.66 MiB/s, done.\nFrom https://github.com/noir-lang/noir\n * tag                     nightly-2025-03-11 -> FETCH_HEAD\nWarning: you are leaving 6 commits behind, not connected to\nany of your branches:\n\n  ba0ad9e5f2 Noir local patch commit.\n  41425e3e82 Ignore package.tgz\n  e5942f5295 chore: delete leftover file\n  b98e22d860 chore: turn on `skipLibCheck`\n ... and 2 more.\n\nHEAD is now at 1fa0dd95a9 chore: bump external pinned commits (#7640)\n[detached HEAD 96b25f1022] Noir local fixup commit.\n 4 files changed, 108 insertions(+), 2 deletions(-)\n create mode 100755 acvm-repo/acvm_js/build.sh.bak\n create mode 100755 tooling/noirc_abi_wasm/build.sh.bak\nApplying: patch: delete honk example programs\nApplying: chore: turn on `skipLibCheck`\nApplying: chore: delete leftover file\nApplying: Ignore package.tgz\n[detached HEAD 2e591ecb7c] Noir local patch commit.\ncb3599adbc8ee588\n\n# We can still query the hash as it was before\n% AZTEC_CACHE_COMMIT=HEAD~1 ./noir/bootstrap.sh hash                                                                                                                                            13s \nbf9bcc2b4f6046c7\n\n```",
          "timestamp": "2025-03-18T18:18:35-04:00",
          "tree_id": "cc29259eb5b7d0bc778b8487a29c2a4c26582f90",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fa5991f80fdfb0fbde5fa8062367b339236abe4d"
        },
        "date": 1742337709248,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9311,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22721308383821975,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137700,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5df2aea2b1723a5cf7db1dc7d9966f3b8fba476a",
          "message": "fix: clientivc capture benchmarks include authwits (#12873)\n\nBuilds on top of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/12868\n\nFixes benchmarks by making sure the profile call gets the correct\nauthwitnesses.\n\n---------\n\nCo-authored-by: MirandaWood <miranda@aztecprotocol.com>",
          "timestamp": "2025-03-19T15:06:01+01:00",
          "tree_id": "b5fbf1b087d8ff5eb634bffc106957f134fc3b4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5df2aea2b1723a5cf7db1dc7d9966f3b8fba476a"
        },
        "date": 1742395021808,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8552,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20868871282054063,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 112566,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "545b4e0f98fd494d3e9cfc1a117cc86a43e4f26a",
          "message": "fix: Don't log config (#12876)\n\nWe shouldn't just log out the complete node configuration. It may\ncontain sensitive data.",
          "timestamp": "2025-03-19T14:53:58Z",
          "tree_id": "c99a31fba0a121bc487448c96876dfb7e287ba4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/545b4e0f98fd494d3e9cfc1a117cc86a43e4f26a"
        },
        "date": 1742397735058,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9701,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2367232016907718,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151126,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "04981e2a395e51cd07a398c173d55a3a3a53ae44",
          "message": "refactor(avm): vm2 recursive execution (#12842)\n\nAfter discussions with @IlyasRidhuan we think this is the most viable\npath to make things work for CALL and context management.",
          "timestamp": "2025-03-19T23:10:37+08:00",
          "tree_id": "363b64f68372aa2a122218855730d4bdbcc0fe17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04981e2a395e51cd07a398c173d55a3a3a53ae44"
        },
        "date": 1742398759429,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8359,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20397144644515502,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106268,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "james.zaki@proton.me",
            "name": "James Zaki",
            "username": "jzaki"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c9ea1cd2d36939d2064d05af998da47d18e12751",
          "message": "docs: additions (#12551)",
          "timestamp": "2025-03-19T15:49:03Z",
          "tree_id": "560a4a28c7274fd4b97a5e7310d266b7f12c6d52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c9ea1cd2d36939d2064d05af998da47d18e12751"
        },
        "date": 1742401025137,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9453,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23068258284215246,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140670,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "65bd2764bdeafe6f2d259600b809d002c49e74fd",
          "message": "feat: precomputed ClientIVC VKs (#12126)\n\nAfter this PR, we no longer rely on a user provided vk when verifying\ncivc proofs. This was insecure.\n\n`yarn-project/bb-prover` now has a `yarn generate` step that creates two\nfiles in `yarn-project/bb-prover/artifacts`: `private-civc-vk` and\n`public-civc-vk`. These correspond to clientivc stacks that end in the\nprivate and public tail, respectively.\n\nThis is achieved by pinning historic CIVC inputs and using one public\nand private example, respectively. If the number of public inputs in the\ntail circuits, or the fundamental structure, change we will need to bump\nthis. This pinning will be obsoleted by\nhttps://github.com/AztecProtocol/barretenberg/issues/1296.\n\nThe write_vk command **is to be considered undocumented**. It is subject\nto change. Namely, a future simplification\n(https://github.com/AztecProtocol/barretenberg/issues/1296) will make it\nnot take an ivc stack. Original comments by Cody below:\n```\nAdd a write_vk command to generate a vk for generating ClientIVC proofs. This consists of: a vk for 'the' hiding circuit, a vk for the ECCVM and a vk for the Translator. The later two could and perhaps should go away in the future since they are actually just fixed constants known at C++ compile time. The former sounds like a constant, but in fact the key depends on the number of outputs of the final circuit in a stack to be verified. At the moment the two possibilities in our system are the private kernel tail and tail-to-public circuits, where the latter I'm told has very many PIs, enough that we should have a distinction. I believe this means having two Tubes, or making the Tube receive exeuction time input on which of the two keys it should use.\n\nWe remove the special handling of single circuits in ClientIVC. This was originally added so that there would be _some_ unit tests of the bb binary of ClientIVC, but the new tests in this PR will fill that role better by being more realistic.\nI also shove some little API improvements requested by @saleel in here to make sure they don't get lost in the shuffle.\n```\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1245\n\n---------\n\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-19T10:11:38-07:00",
          "tree_id": "82a7de1b6215d0c66c8dc984e155c2e7a1c0e67a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65bd2764bdeafe6f2d259600b809d002c49e74fd"
        },
        "date": 1742406987734,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9210,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2247386963177913,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147270,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "dc8ab31a7fb88e1054e177cbe7b8594da16f24af",
          "message": "fix: misleading test (#12877)\n\n@nventuro this test became misleading because of changes you did in the\npartial notes PR\n<img width=\"1451\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/b963e655-95bf-4be5-8874-ca7e81bf402c\"\n/>\n\nIn this PR I clarify it.",
          "timestamp": "2025-03-19T14:25:45-03:00",
          "tree_id": "a91af56fa58c1c10da01ece4d731851be82f230d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc8ab31a7fb88e1054e177cbe7b8594da16f24af"
        },
        "date": 1742407297522,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8734,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21312046293174478,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 111672,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "spypsy@users.noreply.github.com",
            "name": "spypsy",
            "username": "spypsy"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b9e6a1978c2f2c880634b40b16c11ab2e025691a",
          "message": "chore: allow individual service data map size configuration (#12853)\n\nFixes #12831",
          "timestamp": "2025-03-19T17:25:36Z",
          "tree_id": "2b0deb0d162900eaad827c940b5850598993007f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b9e6a1978c2f2c880634b40b16c11ab2e025691a"
        },
        "date": 1742407907253,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8518,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20784761942768326,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 110365,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "aec93dfb44cc98b49bfedd68b7f15d2d22b79947",
          "message": "fix: yolo fix",
          "timestamp": "2025-03-19T18:29:46Z",
          "tree_id": "28a09124d253f4f6a52ffdf9ccc7520b72e1f1b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aec93dfb44cc98b49bfedd68b7f15d2d22b79947"
        },
        "date": 1742412045519,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8680,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21181302417104325,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 109863,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4bae3974f8d6a069b4b5cce796e5a0385d4ff04c",
          "message": "fix: oracles handlers (#12864)",
          "timestamp": "2025-03-19T22:07:10+01:00",
          "tree_id": "fabc91552394a2335a8b36f4de7e5eadeec19416",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4bae3974f8d6a069b4b5cce796e5a0385d4ff04c"
        },
        "date": 1742421201375,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9434,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23020135943110798,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 127275,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "09a09d5a6e3d6960eb054cbee58415bfc939e55f",
          "message": "feat(avm): instruction fetching parsing error (#12804)",
          "timestamp": "2025-03-20T10:03:15+01:00",
          "tree_id": "4e35db69b6e4ee66b5b27ce38764f9ca81f04f46",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a09d5a6e3d6960eb054cbee58415bfc939e55f"
        },
        "date": 1742464278971,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9641,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23527086734957958,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137888,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d69901f2953ee6f2aecb4fbdcc1776393d9002f8",
          "message": "chore(avm): Constrain pc_size_in_bits column and rename (#12899)",
          "timestamp": "2025-03-20T12:57:38+01:00",
          "tree_id": "c1e526128a96fb24a11fb5036801ceff543a23ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d69901f2953ee6f2aecb4fbdcc1776393d9002f8"
        },
        "date": 1742474437948,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9872,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24090232374381484,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139053,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "16536249+LHerskind@users.noreply.github.com",
            "name": "Lasse Herskind",
            "username": "LHerskind"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fd7adb1b39540b98d72b17fff5f2ec6bf81de143",
          "message": "chore: fix archiver.test.ts (#12907)\n\nSomehow CI passed on #12863 even though this test is failing because of the changes 😅 This pr should fix it by putting in the proper layers.",
          "timestamp": "2025-03-20T14:33:31Z",
          "tree_id": "3c80380eb061572b7f5001f0697fc7fd8eeda8a2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd7adb1b39540b98d72b17fff5f2ec6bf81de143"
        },
        "date": 1742483216775,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9653,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23554728941601233,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130105,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "spypsy@users.noreply.github.com",
            "name": "spypsy",
            "username": "spypsy"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6efc8cee715537bb69ae46994ce5f4bdf6d10485",
          "message": "chore: vars for --network ignition-testnet (#12886)",
          "timestamp": "2025-03-20T15:03:58Z",
          "tree_id": "2a52d437f6c8e26065230d062d503214091bb1da",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6efc8cee715537bb69ae46994ce5f4bdf6d10485"
        },
        "date": 1742485200777,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9805,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23926713433820745,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156410,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "15848336+TomAFrench@users.noreply.github.com",
            "name": "Tom French",
            "username": "TomAFrench"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "16232c8df518dc7915c39066178124cdfefd962a",
          "message": "chore: add support for caching `node_modules` within a nested repository (#12862)\n\nThis PR removes a hack added in #12760\n\nThis fixes an issue where we were querying the root git repository for\nhashes for files which are only tracked in the `noir/noir-repo`\nrepository. We now set the `REPO_PATH` env variable so that we run `git\nls-tree` on the correct repository.",
          "timestamp": "2025-03-20T15:20:05Z",
          "tree_id": "5d6efc63255d5687cc0b3b99b5c976de1e4b2f4f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/16232c8df518dc7915c39066178124cdfefd962a"
        },
        "date": 1742486115420,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10094,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24630487272318854,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152817,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d96fc0e596e04d3266b9f31b2eed338260ccf91",
          "message": "chore: Remove magic number from AVM bytecode (#12900)",
          "timestamp": "2025-03-20T16:29:51+01:00",
          "tree_id": "eccf26f869554c1091c192f6256302a4e9fb4c44",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d96fc0e596e04d3266b9f31b2eed338260ccf91"
        },
        "date": 1742486507232,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9533,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23262933493134177,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139763,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47148561+Maddiaa0@users.noreply.github.com",
            "name": "Maddiaa",
            "username": "Maddiaa0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "096f7394297e1b0fb01237423589ef4b814b7e06",
          "message": "feat(sol): setup epoch - sampling without replacement (#12753)\n\n## Overview\n\nSimple Sample without replacement with transient storage. Updates how\ncertain functions on the rollup is consumed to work around viem.\n\nCore update:\nsetupEpoch -  3,476,415  -> 1,372,704\n\n---------\n\nCo-authored-by: LHerskind <16536249+LHerskind@users.noreply.github.com>",
          "timestamp": "2025-03-20T15:58:27Z",
          "tree_id": "981188f3d8608f730e90ef82a86374bcb9f34dce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/096f7394297e1b0fb01237423589ef4b814b7e06"
        },
        "date": 1742488141685,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9886,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2412333392194268,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132237,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "13aa4f5fabadcd18daae30bac3955145eb44837e",
          "message": "chore: Cleanup and re-specify sequencer config in RC1 (#12898)\n\nThis PR just re-specifies sequencer config in RC-1 to ensure it doesn't\ninadvertently get overwritten. Also some cleanup of old env vars.",
          "timestamp": "2025-03-20T16:33:38Z",
          "tree_id": "b1c544f4493e8ac3bd80aa0f96d39e507b57d4b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/13aa4f5fabadcd18daae30bac3955145eb44837e"
        },
        "date": 1742490033136,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9508,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23202232982902274,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138547,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "51711291+natebeauregard@users.noreply.github.com",
            "name": "Nate Beauregard",
            "username": "natebeauregard"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a96a908faa8122d026372a66423c94c256aa2dba",
          "message": "chore(p2p): add tx queue to prevent ddos attacks (#12603)\n\ncloses https://github.com/AztecProtocol/aztec-packages/issues/12416\n\nAdds a `SerialQueue` for sending one tx at a time and adds a timeout of\n1s for invalid tx proofs to be invalidated.\n\nAdditionally, adds a new e2e test to ensure that large influxes of\ninvalid txs are filtered out and do not cause the node to crash or\nprevent valid txs from persisting through the p2p network.\n\n---------\n\nCo-authored-by: PhilWindle <60546371+PhilWindle@users.noreply.github.com>",
          "timestamp": "2025-03-20T16:49:19Z",
          "tree_id": "2f64d2d9b3078e294b92768b416f901e10d5b3d5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a96a908faa8122d026372a66423c94c256aa2dba"
        },
        "date": 1742491174496,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9805,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23927274484839797,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142582,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fa2bf95359545956c6dd9f394026b138fd93e600",
          "message": "feat: generate subrelation-label comment in generated relation hpp (#12914)",
          "timestamp": "2025-03-20T18:23:52Z",
          "tree_id": "0bdd046350c1d1dc63bdcd33b7dca150e45497ca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fa2bf95359545956c6dd9f394026b138fd93e600"
        },
        "date": 1742496806595,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8700,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21230200979943617,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 109803,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5d871f8f662f5fa2dc3b278cd35e5f54f58ef220",
          "message": "fix: Removed logged config object in L1 Tx Utils (#12901)",
          "timestamp": "2025-03-20T18:35:17Z",
          "tree_id": "72ffa6fb15d7737636aacda48581e16f8f1c9826",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d871f8f662f5fa2dc3b278cd35e5f54f58ef220"
        },
        "date": 1742497526971,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9676,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2361185324477629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131578,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "saleel@aztecprotocol.com",
            "name": "saleel",
            "username": "saleel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5b064bcc6eb347dd53ad3870fe0486792d2f79bb",
          "message": "fix(bb.js): remove size metadata from UH proof (#12775)\n\nFixes #11829 \n\n- Remove first 4 bytes from proof (metadata - length of \"proof + PI\" in\nfields) returned from `UltraHonkBackend.generateProof()`\n- `proof` returned is now 14080 bytes (440 fields) and can be directly\nverified in solidity\n\n\nNote: `proof` output from bb CLI also includes the size metadata in the\nfirst 4 bytes. This should go away with #11024\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-20T22:26:33+04:00",
          "tree_id": "1575143bb9da65fe27f3bf7c4f6f57b753f29724",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b064bcc6eb347dd53ad3870fe0486792d2f79bb"
        },
        "date": 1742499866015,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8816,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21511593888642222,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 107214,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "61068dae2f702ce5dba74b36a50b68112ae05d38",
          "message": "Revert \"feat: recording circuit inputs + oracles (#12148)\"\n\nThis reverts commit 5436627816d1b675f7bf68ec43fbd4807bd0d142.",
          "timestamp": "2025-03-20T23:00:01Z",
          "tree_id": "6d09443715c094fdad5e0bc916c5f3e2159b9d3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/61068dae2f702ce5dba74b36a50b68112ae05d38"
        },
        "date": 1742513649616,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8766,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21390429237465422,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 105060,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "41bf13e9bfc87167fae10af7e5c84d05ae7d7193",
          "message": "fix: Disallow registration of contract classes with no public bytecode (#12910)\n\nThe transpiler also injects now a revert public_dispatch function of 22\nbytes (1 field) in contracts without public functions.",
          "timestamp": "2025-03-21T09:53:14+01:00",
          "tree_id": "e3d6dad24c65711a9f33bdc1093411e55818d6d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/41bf13e9bfc87167fae10af7e5c84d05ae7d7193"
        },
        "date": 1742549505351,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9677,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23614116991419812,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143280,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ce84b2ddf99374bb0748d7b020025d087e531c63",
          "message": "chore: Bump Noir reference (#12894)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add more test suites to CI\n(https://github.com/noir-lang/noir/pull/7757)\nchore(docs): Avoid colliding filenames\n(https://github.com/noir-lang/noir/pull/7771)\nfeat(ssa): Basic control dependent LICM\n(https://github.com/noir-lang/noir/pull/7660)\nchore: run `noir_wasm` over `test_programs`\n(https://github.com/noir-lang/noir/pull/7765)\nfix(ci): Fail the CI job on a Brillig report failure\n(https://github.com/noir-lang/noir/pull/7762)\nfix(ci): Exclude inliner specific reference count tests from Brillig\ntrace report (https://github.com/noir-lang/noir/pull/7761)\nchore: pull out pure functions from interpreter\n(https://github.com/noir-lang/noir/pull/7755)\nfix: add missing inputs to `BlackBoxFuncCall::get_inputs_vec` for EcAdd\n(https://github.com/noir-lang/noir/pull/7752)\nfeat: add `EmbeddedCurvePoint::generator()` to return generator point\n(https://github.com/noir-lang/noir/pull/7754)\nchore: remove bun from docs in favour of yarn\n(https://github.com/noir-lang/noir/pull/7756)\nchore: Fix rustdocs error (https://github.com/noir-lang/noir/pull/7750)\nchore: add `shared` module within `noirc_frontend`\n(https://github.com/noir-lang/noir/pull/7746)\nchore: push users towards nargo in tutorial\n(https://github.com/noir-lang/noir/pull/7736)\nchore: Add GITHUB_TOKEN for downloading prost_prebuilt to acvm.js build\n(https://github.com/noir-lang/noir/pull/7745)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-03-21T10:56:43Z",
          "tree_id": "e86921fc239d6fecfe6968486da5bde3fb537bc9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce84b2ddf99374bb0748d7b020025d087e531c63"
        },
        "date": 1742557030620,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9142,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2324908253308054,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131138,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "alexghr@users.noreply.github.com",
            "name": "Alex Gherghisan",
            "username": "alexghr"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7aa0b871bb154ad50cb4643bae0879d89244f784",
          "message": "fix: pass bot salt (#12923)\n\nPass deployment salt for the bot's account contract based on the its pod\nname. (This way we can have multiple bots all producing private txs)",
          "timestamp": "2025-03-21T11:56:10Z",
          "tree_id": "8eb2656a7b0c3e8945c741f701f5852dc442b313",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aa0b871bb154ad50cb4643bae0879d89244f784"
        },
        "date": 1742560111282,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9456,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2404891934978456,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132321,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c524339c1fcc5202a634fe2edeff4c4606a31d87",
          "message": "feat: Montgomery optimisation (partial) (#12822)\n\nChanges Montgomery reduction in wasm for 254-bit fields to include\nYuval's trick and prepares constants for similar changes in x86_64.\nBefore:\n\n![image](https://github.com/user-attachments/assets/0fb0f037-b24f-43d2-b12e-ae6c9675abe8)\nAfter:\n\n![image](https://github.com/user-attachments/assets/52914d78-5d8a-4735-be9e-d58bb1822cab)",
          "timestamp": "2025-03-21T12:42:42Z",
          "tree_id": "c3703c4d20381bcfcb427902832d6275209ab565",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c524339c1fcc5202a634fe2edeff4c4606a31d87"
        },
        "date": 1742563267703,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23888503753122825,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136933,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "68168980+just-mitch@users.noreply.github.com",
            "name": "just-mitch",
            "username": "just-mitch"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "716ab4f58b72225c3a9fd96762d549b29290bc61",
          "message": "feat: add minter role to TestERC20 (#12889)\n\nAllows multiple accounts to be minters of the staking and fee assets.\n\nCreates a FeeAssetHandler in the periphery to allow mints of a fixed\nsize.\n\nAlso allows rollup owner to update the mana target (and thus, the mana\nlimit which is twice the target).\n\nSee\n[design](https://github.com/AztecProtocol/engineering-designs/blob/42455c99b867cde4d67700bc97ac12309c2332ea/docs/faucets/dd.md#testerc20)\n\nFix #12887\nFix #12882",
          "timestamp": "2025-03-21T10:11:56-04:00",
          "tree_id": "9935c202bf8e512b93fb44eb02f255383fcacb23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/716ab4f58b72225c3a9fd96762d549b29290bc61"
        },
        "date": 1742567978935,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9232,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23478361520280255,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143834,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9770e1513e46566147f471f287f4202c27dfd604",
          "message": "feat!: `AztecNode.findLeavesIndexes` returning block info (#12890)",
          "timestamp": "2025-03-21T08:26:50-06:00",
          "tree_id": "b5a2ec16b2d2e9850232410212fff88e9465e365",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9770e1513e46566147f471f287f4202c27dfd604"
        },
        "date": 1742568720900,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9252,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23528786175802854,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135651,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cb978b5a848214803d81dc791800c0976835e4ad",
          "message": "chore: Add comment on verifyHistoricBlock (#12933)\n\nAdds comment on `verifyHistoricBlock` for clarity.",
          "timestamp": "2025-03-21T15:17:48Z",
          "tree_id": "9a98b7a24f0f7eae4d0b3aeb28f4f207cf02536c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb978b5a848214803d81dc791800c0976835e4ad"
        },
        "date": 1742570917582,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9809,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24945780346417062,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131851,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bf9a034fe72efdc1a8dc8820983ec091d0efb995",
          "message": "feat: reapplying reverted circuits recorder with a fix (#12919)",
          "timestamp": "2025-03-21T15:54:51Z",
          "tree_id": "80110738438c13dc1f7cfd786f4198e108458d79",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf9a034fe72efdc1a8dc8820983ec091d0efb995"
        },
        "date": 1742573134203,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9016,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22927897037234216,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130212,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "42733a693956e67a38a094688df119a7a87593f8",
          "message": "fix: Fix prover node publisher for multi-proofs (#12924)\n\nThe prover node publisher did not correctly support multi-proofs. This\nshould fix it.",
          "timestamp": "2025-03-21T16:09:06Z",
          "tree_id": "9dce50895632c159921223e7600a6e5f59794ebe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42733a693956e67a38a094688df119a7a87593f8"
        },
        "date": 1742574896061,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9234,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2348272258685672,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135720,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "05af647330aa6ec5dfebbc3f66ab36531ca29ae1",
          "message": "chore: separated multi map and fixed indexeddb map (#12896)\n\nThis PR cleans up `kv-store` a bit, attempting to separate maps and\nmultimaps a little bit better. The old approach caused a very stupid but\ndifficult to track bug in the `IndexedDB` implementation that would\ncause partial notes to never be discovered and simulations to crash.\n\nAlso removed the `WithSize` variants of maps that were not implemented\nin most store types and had a different testing flow, since they appear\nto be completely unused @Maddiaa0\n\n@alexghr do you think we can get rid of the old lmdb implementations\nsoon?",
          "timestamp": "2025-03-21T17:47:05+01:00",
          "tree_id": "b0a8bd96f469c8fee9cde2a6ec88f8fd6f149ac8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/05af647330aa6ec5dfebbc3f66ab36531ca29ae1"
        },
        "date": 1742576996613,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9599,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2441192884020391,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148508,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0ae68919479ba44188ad3797ef7832c987870a18",
          "message": "feat(avm): Port field gt to vm2 (#12883)\n\nPorts field greater than to vm2, removing non-ff and eq functionality,\nwhich could be trivally inlined in other gadgets.",
          "timestamp": "2025-03-21T18:36:23+01:00",
          "tree_id": "24dc2925ae93c0ccda3b9cf0d73e24ddb80fa6c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ae68919479ba44188ad3797ef7832c987870a18"
        },
        "date": 1742580527965,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8377,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2130508109139965,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 108081,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "alexghr@users.noreply.github.com",
            "name": "Alex Gherghisan",
            "username": "alexghr"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "43155d693ef1e957a44cad0d8375a7d771ad857a",
          "message": "fix: pull CRS data ahead of time (#12945)\n\nDownload a bunch of points needed for proof generation/verification.\nNOTE: the point files are cached so if the files that exist in the\ndefault location already contain enough points this is a noop (a good\nidea to use docker volumes)",
          "timestamp": "2025-03-21T18:50:44Z",
          "tree_id": "cb540182784315d15fd870f0df8e3dff0750f182",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/43155d693ef1e957a44cad0d8375a7d771ad857a"
        },
        "date": 1742584232503,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8397,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21355543098155416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106921,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1a016024b60b6b35946d899b3943a420b010b768",
          "message": "feat: use msgpack for ClientIvc::Proof in API (#12911)\n\nSwitches to using msgpack for serialization/deserialization of a\nClientIVC::Proof, instead of our custom serialization lib.\n\nThis was motivated by the desire to gracefully handle (reject) invalid\nproof buffers (in the form of fully random bytes) in native\nverification. Our custom serialization library is not meant to handle a\nfully random buffer because it relies on 4-byte chunks containing size\ndata that indicate how much to read from an address. When the size bytes\nare corrupted, the code may attempt to read into uninitialized memory.\nMsgpack on the other hand will throw a meaningful and consistent error\nwhen the proof structure is not as expected. This results in\nverification failure by default.\n\nNote: if the proof has valid structure but is not itself valid,\nverification will proceed as normal and return failure in a time less\nthan or equal to that required for successful verification.\n\n---------\n\nCo-authored-by: PhilWindle <philip.windle@gmail.com>\nCo-authored-by: cody <codygunton@gmail.com>",
          "timestamp": "2025-03-21T20:02:31Z",
          "tree_id": "25c0caa77aef167d7c1fa6c708028ff6457b93ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a016024b60b6b35946d899b3943a420b010b768"
        },
        "date": 1742589294409,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8493,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21599009210249506,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 108298,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "15848336+TomAFrench@users.noreply.github.com",
            "name": "Tom French",
            "username": "TomAFrench"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "397144f93b72ea7fdbddc7251e3fd3cef8672652",
          "message": "fix: no hardcoded versions in bbup (#12944)\n\nI've updated bbup to pull the version of bb to install for a given noir\nversion from a json file in aztec-packages (previously it would read\nsome file inside of the noir repo at the given release tag of noir that\nthey have installed.\n\nWe can then update this in future without needing to migrate people onto\nnew versions of bbup.",
          "timestamp": "2025-03-21T20:35:32Z",
          "tree_id": "076d83003542592699f9b338ba04ba2d6b26fbe6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/397144f93b72ea7fdbddc7251e3fd3cef8672652"
        },
        "date": 1742589988851,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8220,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20904054362247612,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 109884,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3",
          "message": "chore: fee cleanup (#12941)\n\n- `SponsoredFeePaymentMethod` gets into `aztec.js` , but that's it\n(meaning the method can be used from aztec.js, but there's no concept of\nwhere's deployed/how to get the address/bytecode, etc). It's under\n`@aztec/aztec.js/fee/testing` to make abundantly clear that this is not\na \"production acceptable\" approach.\n- Similarly to `setupCanonicalL2FeeJuice` there's a utility method that\ncan be used from the CLI/during sandbox setup to deploy a\n`SponsoredFeePaymentContract`. It spits out the address where the\ncontract is located, just like the test accounts.\n- You CAN programatically obtain the address of the \"canonical\"\n`SponsoredFeePaymentContract` via `@aztec/sandbox`, but you CANNOT via\n`@aztec/aztec.js`. This is because getting the address implies loading\nthe contract bytecode and it's not a protocol contract, making imports\nmessy and tripping the user into making poor decisions in their app\ndesign. If you want to use it in your app, obtain it from the sandbox\noutput or from an announcement (just like a faucet address, for example)\n- This address is only canonical in the sense it's salt is hardcoded to\n0 (this lives in `@aztec/constants` under `SPONSORED_FPC_SALT`. For\ntestnet it should be prefunded! @PhilWindle @alexghr\n\nThis PR also builds upon the work done in `aztec.js`, allowing us to\nfinally get rid of the special handling of account contract deployments\n`deploy_account_method.ts` by creating a new `FeePaymentMethod` (that's\nnot exposed externally!) that allows an account to pay for its own\ndeployment 😁\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-03-21T21:37:07+01:00",
          "tree_id": "eaa4338861daa992bb53836b61dd28190a07ca6e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3"
        },
        "date": 1742590951089,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8311,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21135513940667963,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106240,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c3337af484a752294b2a817649ac69de5cadae11",
          "message": "fix: Remove workaround (#12952)",
          "timestamp": "2025-03-21T21:41:13Z",
          "tree_id": "78a72acf3442cb57d2283519eb68e18e97c55857",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3337af484a752294b2a817649ac69de5cadae11"
        },
        "date": 1742594757439,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9140,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23244337737438003,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146430,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e13edb83b72a593ba3a5106d411d2537016d036e",
          "message": "chore: L2 chain config for alpha testnet (#12962)\n\nThis PR adds a chain config block for alpha testnet",
          "timestamp": "2025-03-22T14:36:35Z",
          "tree_id": "3dc7765831ac6268495d5133ff4e24d15d2adc41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e13edb83b72a593ba3a5106d411d2537016d036e"
        },
        "date": 1742655113958,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9253,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2353060767323704,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138853,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "3933b35bcf92f20c32dfd742d01c3caaf7ad977f",
          "message": "fix: yolo txe binds just to localhost by default.",
          "timestamp": "2025-03-22T19:11:58Z",
          "tree_id": "c917dc69dc265ae758cde5692d8f0692512851f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3933b35bcf92f20c32dfd742d01c3caaf7ad977f"
        },
        "date": 1742672130324,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9843,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2503157733480786,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148031,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7843a6714547a71c64274830ebb6176d78dbb890",
          "message": "chore: Change `/bin/bash` shebang to be env based (#12834)\n\nChanges `#!/bin/bash` in scripts into `#!/usr/bin/env bash`, to be more\ncross platform.\n\n### Why?\n\nI was just trying to test initialising `noir-repo` on my Mac, because I\nwanted to avoid having to delete it on the mainframe, however the\nversion of `bash` shipped with MacOS is 3.2, and it doesn't have all the\noptions that the `ci3` scripts assume, which caused failures. I have the\nlatest `bash` installed via Homebrew, but the scripts are coded to use\nthe one in `/bin`, which is the old version and cannot be updated.\n\n```console\n$ hash=$(./noir/bootstrap.sh hash)\n/Users/aakoshh/Work/aztec/aztec-packages/ci3/source_options: line 9: shopt: globstar: invalid shell option name\n$ shopt\n...\nglobskipdots   \ton\nglobstar       \toff\ngnu_errfmt     \toff\n...\n$ echo $SHELL\n/opt/homebrew/bin/bash\n$ /bin/bash --version\nGNU bash, version 3.2.57(1)-release (arm64-apple-darwin24)\nCopyright (C) 2007 Free Software Foundation, Inc.\n$ /opt/homebrew/bin/bash --version\nGNU bash, version 5.2.37(1)-release (aarch64-apple-darwin24.0.0)\n$ /bin/bash\n$ shopt\n...\nforce_fignore  \ton\ngnu_errfmt     \toff\nhistappend     \toff\n...\n```",
          "timestamp": "2025-03-22T22:36:09Z",
          "tree_id": "cdd738af86bfece376a20ac399eedd13061319f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7843a6714547a71c64274830ebb6176d78dbb890"
        },
        "date": 1742685237156,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9303,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23659578414704144,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142725,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "leizciw@gmail.com",
            "name": "Leila Wang",
            "username": "LeilaWang"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "18bcc1b1777650d6249e2cdc824ed8acbe39c506",
          "message": "refactor: remove selector from public call request (#12828)\n\n- Remove `function_selector` from `PublicCallRequest` as it is no longer\nused.\n- Remove `public_functions` from `ContractClass`.\n- `ContractClass` checks that there's at most 1 public function in the\nartifact.\n- Rename `args` to `calldata` when it's public calldata that includes\nthe function selector.\n- Use different generator indexes for calldata and regular args.\n\n### aztec-nr\n- Rename oracle calls `enqueue_public_function_call_internal ` to\n`notify_enqueued_public_function_call `, and\n`set_public_teardown_function_call_internal` to\n`notify_set_public_teardown_function_call `, to be consistent with other\noracle calls.\n- Storing data to execution cache will need to provide the hash in\naddition to the preimage, making it possible to use it for different\ntypes of data. Currently it's used for calldata and args.\n\n### node\n- Rename `getContractFunctionName` to `getDebugFunctionName`, as the\nfunction name won't always be available. It's set by explicitly calling\n`registerContractFunctionSignatures` for debugging purpose.\n- Remove `ExecutionRequest[]` in `Tx` and replace it with `calldata[]`.\nWe now loop through the `publicCallRequests` in the public inputs and\npair each with an entry in `calldata[]`.\n- `DataValidator` checks that calldata are provided for all the\nnon-empty public call requests, and the hash is correct.",
          "timestamp": "2025-03-23T13:50:19Z",
          "tree_id": "da67f601d8c18deba44229b7133b3a9d7a20a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18bcc1b1777650d6249e2cdc824ed8acbe39c506"
        },
        "date": 1742740221184,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9294,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23636694550087337,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143174,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "75c1549dd325cd42da22e407de8971c909050561",
          "message": "chore: Set default proving config to true (#12964)\n\nUp until now our configurations have generally defaulted to swtiching\noff proving. This is desirable for e2e tests and the sandbox etc. I\nthink we are at the point where the default should be switched on and\nthe user has to make a decision to switch it off.",
          "timestamp": "2025-03-23T16:17:51Z",
          "tree_id": "34e5b52c6f1215c400e36bf32de7b35881c85b5f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/75c1549dd325cd42da22e407de8971c909050561"
        },
        "date": 1742748521159,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9250,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23525005669526367,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134222,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "68168980+just-mitch@users.noreply.github.com",
            "name": "just-mitch",
            "username": "just-mitch"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10",
          "message": "chore: deflake the kind smoke test (#12955)\n\nSmoke test runs in just under 5 minutes in ci now (just under 3 minutes\nlocally).\nIt has ran through the deflaker (locally) 100 times with no error; i.e.\n\n```\n./yarn-project/end-to-end/scripts/deflaker.sh ./spartan/bootstrap.sh test-kind-smoke\n```\n\nHowever, it did flake when I was running it on mainframe, so updating\nmyself to receive slack notifications.\n\nSee [passing CI run](http://ci.aztec-labs.com/5ffc13f772a79c68)\n\nchanges:\n- have the pxe and bot just connect to the boot node\n- retain the setup l2 contracts job if it fails\n- make the 1-validators yaml lighter/faster\n- use 1-validators in the smoke test in CI\n- fix the kubectl await to only await the pxe\n- make the deflaker support bootstrap scripts\n\nFix #11177",
          "timestamp": "2025-03-23T14:40:39-04:00",
          "tree_id": "370aae2582cceb57e889c939284ddc574d7c6e4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10"
        },
        "date": 1742756816897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9256,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2354052843307416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131680,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "49d6bfadb0584e7d5238a319540e2b28255fb688",
          "message": "fix: increased poseidon gates (#12973)\n\nAfter this: https://github.com/AztecProtocol/aztec-packages/pull/12061\nwe were overflowing the trace on contract class registrations. This was\nnot caught by tests due to:\n\n- Insufficient tests with full proving (and the ones we have deploy\nwithout proving!)\n- Insufficient WASM testing: this overflow caused the overflowing trace\nto go over 4GB",
          "timestamp": "2025-03-24T12:11:33+01:00",
          "tree_id": "9cf42eebcbf4d5f2a92b189fd26776e6b180c534",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49d6bfadb0584e7d5238a319540e2b28255fb688"
        },
        "date": 1742815249246,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9149,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23266960450820626,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130863,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5a256c8abaeb65a1fdc47eb674ae19819a795d48",
          "message": "chore: Fix for e2e gossip network test (#12954)",
          "timestamp": "2025-03-24T11:46:28Z",
          "tree_id": "7ec30bc2d4f67e00b8bc288c5f7d7a02ebef1e6d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a256c8abaeb65a1fdc47eb674ae19819a795d48"
        },
        "date": 1742818710745,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9201,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23400308135257525,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132673,
            "unit": "us"
          }
        ]
      }
    ]
  }
}