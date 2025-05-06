window.BENCHMARK_DATA = {
  "lastUpdate": 1746491492714,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Protocol Circuit Gate Counts": [
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "c1cbbadfca7e48cc892c818da16a62fd596fcc5a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"58fd8174c5\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"58fd8174c5\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-01T02:34:19Z",
          "tree_id": "c69f068f9e6d6259cc2695f89afe1b667835960a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1cbbadfca7e48cc892c818da16a62fd596fcc5a"
        },
        "date": 1746069039307,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "0565b2d9c38dc55406eff514e695c829d1bd83c5",
          "message": "chore: codeowner and changetest (#13962)\n\nAdds a new test that do some minimal checks to catch if the contract\ncode have been changed, and add the turtles as codeowners for the test.\n\nThat way, we should be able to somewhat avoid not noticing if there are\nchanges made to the contracts. It only check a few of the contracts;\n`rollup`, `governance` and `registry` as those are the big ones and\nshould deal with most changes.\n\nI only do codeowners on this one file instead of the dir as we don't to\nbe notified around extra tests or things that would not really cause a\nproblem if used for nodes.",
          "timestamp": "2025-05-01T07:44:20Z",
          "tree_id": "b8bb8afcc6f7805cdbb20ca023258f30a1e082f5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0565b2d9c38dc55406eff514e695c829d1bd83c5"
        },
        "date": 1746087546836,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "helloworld@mcgee.cat",
            "name": "Cat McGee",
            "username": "catmcgee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "1c63984ea112d03669c34b8286f0db62acfc6d27",
          "message": "feat(docs): applying dogfooding feedback in docs (#13920)\n\n- addresses feedback\n- updates getting started to be tabbed sandbox/testnet\n- updates contract tutorials and versioned\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: James Zaki <james.zaki@proton.me>",
          "timestamp": "2025-05-01T08:55:03Z",
          "tree_id": "df7493aea8c314e78913ba40e1631ccc2a449ef0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c63984ea112d03669c34b8286f0db62acfc6d27"
        },
        "date": 1746092203692,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "81e29527f21793209447cf50c7223958fce8cd86",
          "message": "docs: Docs tweaks (#13980)",
          "timestamp": "2025-05-01T08:57:16Z",
          "tree_id": "b232d15c3f2812e523e31ffcc281add60b539cec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/81e29527f21793209447cf50c7223958fce8cd86"
        },
        "date": 1746092265307,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 51070,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968403,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431652,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1610326,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866482,
            "unit": "gates"
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
          "id": "1ae0383ea63a047d2097898334227d1e8d6d6591",
          "message": "chore: Bump Noir reference (#13906)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: add `--debug-compile-stdin` to read `main.nr` from `STDIN` for\ntesting (https://github.com/noir-lang/noir/pull/8253)\nfeat: better error message on unicode whitespace that isn't ascii\nwhitespace (https://github.com/noir-lang/noir/pull/8295)\nchore: update `quicksort` from iterative `noir_sort` version\n(https://github.com/noir-lang/noir/pull/7348)\nfix: use correct meta attribute names in contract custom attributes\n(https://github.com/noir-lang/noir/pull/8273)\nfeat: `nargo expand` to show code after macro expansions\n(https://github.com/noir-lang/noir/pull/7613)\nfeat: allow specifying fuzz-related dirs when invoking `nargo test`\n(https://github.com/noir-lang/noir/pull/8293)\nchore: redo typo PR by ciaranightingale\n(https://github.com/noir-lang/noir/pull/8292)\nchore: Extend the bug list with issues found by the AST fuzzer\n(https://github.com/noir-lang/noir/pull/8285)\nfix: don't disallow writing to memory after passing it to brillig\n(https://github.com/noir-lang/noir/pull/8276)\nchore: test against zkpassport rsa lib\n(https://github.com/noir-lang/noir/pull/8278)\nfeat: omit element size array for more array types\n(https://github.com/noir-lang/noir/pull/8257)\nchore: refactor array handling in ACIRgen\n(https://github.com/noir-lang/noir/pull/8256)\nchore: document cast (https://github.com/noir-lang/noir/pull/8268)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-01T10:02:47Z",
          "tree_id": "e26d7004a8bf1f7a1cb67c47d58e90c0bc92afbe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ae0383ea63a047d2097898334227d1e8d6d6591"
        },
        "date": 1746096430891,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "087ceda7dc06192189e22ea6203cd45ad4ba48e5",
          "message": "docs: block explorer tip and add fees to testnet version (#13988)",
          "timestamp": "2025-05-01T10:46:05Z",
          "tree_id": "c858b1101f40933bc0c65c8dff280940e14b4e27",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/087ceda7dc06192189e22ea6203cd45ad4ba48e5"
        },
        "date": 1746098423759,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "helloworld@mcgee.cat",
            "name": "Cat McGee",
            "username": "catmcgee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "581594d87d80a288b7a08f232d07bf279b17d1db",
          "message": "feat(docs): fix aztecjs getting started (#13989)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: James Zaki <james.zaki@proton.me>",
          "timestamp": "2025-05-01T10:58:04Z",
          "tree_id": "a8f2d9a304dbf1aba9a3c9ff541f9661ed898b16",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/581594d87d80a288b7a08f232d07bf279b17d1db"
        },
        "date": 1746099000285,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "152162806+sklppy88@users.noreply.github.com",
            "name": "esau",
            "username": "sklppy88"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "e032787d31f1d54622b51f38d30926beeb0e4b16",
          "message": "feat: txe state machine (#13836)\n\nThis PR removes the TXe node with an implementation of a TXe state\nmachine which combines an aztec node, and a custom archiver /\nsynchronizer.\n\nNote: Because of the extension of `ArchiverStoreHelper`, there was a\nclash of `getBlocks`, in one interface it was expected to receive\n`L2Blocks`, and in the other `PublishedBlocks`. To solve this, I have\nrenamed `getBlocks` on the `ArchiverStoreHelper` to\n`getPublishedBlocks`. But doing so I also did the same renaming on the\nArchiverDataStore because it seems to better match the signature\nanyways.",
          "timestamp": "2025-05-01T11:58:59Z",
          "tree_id": "49b79e3cc727ff808a0292232131a3a73ab2d254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e032787d31f1d54622b51f38d30926beeb0e4b16"
        },
        "date": 1746103201255,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a9a81c9f7a4e6c984788ea03b8b024914d28591",
          "message": "chore(docs): Update docs to alpha-testnet.5 (#13974)\n\nupdate the default docs version to alpha-testnet.5",
          "timestamp": "2025-05-01T12:37:39Z",
          "tree_id": "7ce927474c1f92b41167603644bfc77bdb901011",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a9a81c9f7a4e6c984788ea03b8b024914d28591"
        },
        "date": 1746105478027,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "7018daa67b6c16de2393990457d0c47f31778a82",
          "message": "chore: use separate KV store for lip2p peers + logging missing txs (#13967)",
          "timestamp": "2025-05-01T12:41:15Z",
          "tree_id": "4b8cb2072d68cf0fce3e1a254cc6bd79932ed03d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7018daa67b6c16de2393990457d0c47f31778a82"
        },
        "date": 1746105825540,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "42022025750c03463ad96deeb64220356c238812",
          "message": "chore(docs): Update blog link in docs (#13982)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-01T13:23:25Z",
          "tree_id": "8bbea9d320e531cf99642304430c9a13527be3b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42022025750c03463ad96deeb64220356c238812"
        },
        "date": 1746107691246,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "64f106c46159fa7c21a42288580d6e8f47348d42",
          "message": "chore: redo typo PR by Maximilian199603 (#13992)\n\nThanks Maximilian199603 for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13983. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T13:30:06Z",
          "tree_id": "a99aca4d50c745662f745b8264c8c5598d8f061e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64f106c46159fa7c21a42288580d6e8f47348d42"
        },
        "date": 1746108693961,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "c383dc6238642a35cc8fe6bd458aaee183c4c154",
          "message": "docs: docs tweaks to versions (#13997)",
          "timestamp": "2025-05-01T14:25:18Z",
          "tree_id": "1ae610abb11b1e7575018352968682803f50c465",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c383dc6238642a35cc8fe6bd458aaee183c4c154"
        },
        "date": 1746111783462,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2",
          "message": "fix(cmake): clientivc uses libdeflate (#13973)",
          "timestamp": "2025-05-01T14:26:05Z",
          "tree_id": "14e8e0c6c34691c03cc29e6d7c9ed5a2f5743ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2"
        },
        "date": 1746112352341,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "8c530294087363dc41785fad4cb19bdd422385da",
          "message": "fix: make zod deserialization of SimulationErrors less strict (#13976) (#13998)\n\ncherry-picked from `alpha-testnet`\nhttps://github.com/AztecProtocol/aztec-packages/pull/13976\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T14:56:51Z",
          "tree_id": "241e5acbf341e24ce91ef4f879b4b252307f1713",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c530294087363dc41785fad4cb19bdd422385da"
        },
        "date": 1746113881613,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "e536c0861c52861c67ca5e552a9a5a7abd291c00",
          "message": "fix: skip sentinel test, much noise",
          "timestamp": "2025-05-01T16:04:29Z",
          "tree_id": "5f2095f46da0d347a93edcaefa72347bc9660964",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e536c0861c52861c67ca5e552a9a5a7abd291c00"
        },
        "date": 1746116280794,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "9cd6766e62d4df089be347be929e8daa4523db5f",
          "message": "docs: Add recommended links for node RPCs (#14001)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-01T16:29:53Z",
          "tree_id": "79adae8caf02f9c3ec8026ae38e047eb8b1cc16d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9cd6766e62d4df089be347be929e8daa4523db5f"
        },
        "date": 1746118874313,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "e4ee6e9c505a30953ce4e7dace56f05de7885f33",
          "message": "feat!: GETCONTRACTINSTANCE opcode has 1 dstOffset operand where dstOffset gets exists and dstOffset+1 gets instance member (#13971)\n\nThis is easier to constrain in the AVM as otherwise it is the only\nopcode with two destination offset operands.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T18:32:00Z",
          "tree_id": "b15736eea6598650d98f3c0fa821e38a021aed08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4ee6e9c505a30953ce4e7dace56f05de7885f33"
        },
        "date": 1746127177175,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mike@aztecprotocol.com",
            "name": "Michael Connor",
            "username": "iAmMichaelConnor"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "ff32e15889f519dc9c556906faaf5f07410c551c",
          "message": "docs: script to unravel deeply nested protocol circuit structs, for readability (#14006)\n\nSpecify the name of a struct that you cannot be bothered tracing through\nthe `nr` codebase.\nIt'll unravel it for you.\n\nThis has already helped me find some potential issues.\n\nE.g. this is the output of unravelling `PrivateCircuitPublicInputs`:\n\n```noir\napp_public_inputs: PrivateCircuitPublicInputs {\n    call_context: CallContext {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        function_selector: FunctionSelector {\n            inner: u32,\n        },\n        is_static_call: bool,\n    },\n    args_hash: Field,\n    returns_hash: Field,\n    min_revertible_side_effect_counter: u32,\n    is_fee_payer: bool,\n    max_block_number: MaxBlockNumber {\n        _opt: Option {\n            _is_some: bool,\n            _value: u32,\n        },\n    },\n    note_hash_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifier_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    key_validation_requests_and_generators: [\n        KeyValidationRequestAndGenerator {\n            request: KeyValidationRequest {\n                pk_m: EmbeddedCurvePoint {\n                    x: Field,\n                    y: Field,\n                    is_infinite: bool,\n                },\n                sk_app: Field,\n            },\n            sk_app_generator: Field,\n        };\n        16,\n    ],\n    note_hashes: [\n        NoteHash {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifiers: [\n        Nullifier {\n            value: Field,\n            counter: u32,\n            note_hash: Field,\n        };\n        16,\n    ],\n    private_call_requests: [\n        PrivateCallRequest {\n            call_context: CallContext {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                function_selector: FunctionSelector {\n                    inner: u32,\n                },\n                is_static_call: bool,\n            },\n            args_hash: Field,\n            returns_hash: Field,\n            start_side_effect_counter: u32,\n            end_side_effect_counter: u32,\n        };\n        5,\n    ],\n    public_call_requests: [\n        Counted {\n            inner: PublicCallRequest {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                is_static_call: bool,\n                calldata_hash: Field,\n            },\n            counter: u32,\n        };\n        16,\n    ],\n    public_teardown_call_request: PublicCallRequest {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        is_static_call: bool,\n        calldata_hash: Field,\n    },\n    l2_to_l1_msgs: [\n        L2ToL1Message {\n            recipient: EthAddress {\n                inner: Field,\n            },\n            content: Field,\n            counter: u32,\n        };\n        2,\n    ],\n    private_logs: [\n        PrivateLogData {\n            log: Log {\n                fields: [\n                    Field;\n                    18,\n                ],\n            },\n            note_hash_counter: u32,\n            counter: u32,\n        };\n        16,\n    ],\n    contract_class_logs_hashes: [\n        LogHash {\n            value: Field,\n            counter: u32,\n            length: u32,\n        };\n        1,\n    ],\n    start_side_effect_counter: u32,\n    end_side_effect_counter: u32,\n    historical_header: BlockHeader {\n        last_archive: AppendOnlyTreeSnapshot {\n            root: Field,\n            next_available_leaf_index: u32,\n        },\n        content_commitment: ContentCommitment {\n            num_txs: Field,\n            blobs_hash: Field,\n            in_hash: Field,\n            out_hash: Field,\n        },\n        state: StateReference {\n            l1_to_l2_message_tree: AppendOnlyTreeSnapshot {\n                root: Field,\n                next_available_leaf_index: u32,\n            },\n            partial: PartialStateReference {\n                note_hash_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                nullifier_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                public_data_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n            },\n        },\n        global_variables: GlobalVariables {\n            chain_id: Field,\n            version: Field,\n            block_number: Field,\n            slot_number: Field,\n            timestamp: u64,\n            coinbase: EthAddress {\n                inner: Field,\n            },\n            fee_recipient: AztecAddress {\n                inner: Field,\n            },\n            gas_fees: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n        total_fees: Field,\n        total_mana_used: Field,\n    },\n    tx_context: TxContext {\n        chain_id: Field,\n        version: Field,\n        gas_settings: GasSettings {\n            gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            teardown_gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            max_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n            max_priority_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n    },\n};\n```",
          "timestamp": "2025-05-01T19:39:28Z",
          "tree_id": "494738671548426bcdcd34af1df86e0acd3a63e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff32e15889f519dc9c556906faaf5f07410c551c"
        },
        "date": 1746131436116,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "199648fe3d9d5c303a53ad8016d7217f2dbefcde",
          "message": "chore: comment civc trace size log parsing (#13975)\n\nGrego is relying on this format and we've changed it a few times lately,\na comment is prudent",
          "timestamp": "2025-05-01T19:16:49Z",
          "tree_id": "2f7eb4ca39583c4baed6fb428c2abb7910a80f88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/199648fe3d9d5c303a53ad8016d7217f2dbefcde"
        },
        "date": 1746131805807,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "e64f0b8a2efe2782ac37e8842fbe0bb989453632",
          "message": "fix(ci): ./bootstrap.sh test (#14007)\n\nA recent change had meant this env var was not set in normal dev work",
          "timestamp": "2025-05-01T20:46:20Z",
          "tree_id": "46a2dfa0812cc55d7f667d661f5faea9e73aaf1c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e64f0b8a2efe2782ac37e8842fbe0bb989453632"
        },
        "date": 1746137000157,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "117ed54cd4bd947f03c15f65cbd2ce312b006ff4",
          "message": "feat: brittle benchmark for UH RV in Ultra gate count (#14008)\n\nAugments UltraRecursiveVerifier test by adding a gate count pinning\ncheck, so we can keep track of the Ultra gate count of a\nMegaZKRecursiveVerifier.\n\nHelps in closing\nhttps://github.com/AztecProtocol/barretenberg/issues/1380 because I\nneeded a measurement of the impact of an optimization.",
          "timestamp": "2025-05-01T21:14:25Z",
          "tree_id": "4084158f6a4253e6b124c2c614b83a6af94ab64b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/117ed54cd4bd947f03c15f65cbd2ce312b006ff4"
        },
        "date": 1746138728894,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b526d3b71db1ad0c5e13773d0affe5dd298d3d0b",
          "message": "feat: detect CIVC standalone VKs changing in CI (#13858)\n\nAdd functionality for previously unused `bb check` when ran in CIVC\nmode. Now checks an input stack, asserting that the same VKs would be\nwritten out.\n\nThis validates the recent fixes to VK generation.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-05-01T21:30:52Z",
          "tree_id": "fe898a542f76202fbaa7c482b103e0f98c9140c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b526d3b71db1ad0c5e13773d0affe5dd298d3d0b"
        },
        "date": 1746139901978,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d6392984c1661c8b49b5fa6e7441c5e576b2bfd9",
          "message": "chore(docs): Add p2p pool size to sequencer docs (#14015)\n\nsee title",
          "timestamp": "2025-05-02T01:46:27Z",
          "tree_id": "596d3315ed1283c9da528e07193a5ecf079717e2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d6392984c1661c8b49b5fa6e7441c5e576b2bfd9"
        },
        "date": 1746153491879,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "d19dfd1c16f64748fdddb6b85602755e1e02aaba",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1ead03ed81\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1ead03ed81\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-02T02:31:33Z",
          "tree_id": "43bab8b7ff645f73236e153e0de7501148825bb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d19dfd1c16f64748fdddb6b85602755e1e02aaba"
        },
        "date": 1746155353766,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619047,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200651,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188042,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183356,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194353,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204001,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199314,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210312,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205625,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144075,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139389,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150386,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145699,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160034,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155347,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166345,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341717,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146204,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141518,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152515,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162163,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157476,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168474,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163787,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102237,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97551,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108548,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103861,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118196,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113509,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124507,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119820,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94845,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968329,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431340,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "19da0fb437f338e2e5fc1ecbca7eb9feb3a03227",
          "message": "chore: Bump Noir reference (#14017)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: disallow emitting multiple `MemoryInit` opcodes for the same block\n(https://github.com/noir-lang/noir/pull/8291)\nfix(ssa): Remove unused calls to pure functions\n(https://github.com/noir-lang/noir/pull/8298)\nfix(ssa): Do not remove unused checked binary ops\n(https://github.com/noir-lang/noir/pull/8303)\nfix: Return zero and insert an assertion if RHS bit size is over the\nlimit in euclidian division\n(https://github.com/noir-lang/noir/pull/8294)\nfeat: remove unnecessary dynamic arrays when pushing onto slices\n(https://github.com/noir-lang/noir/pull/8287)\nfeat(testing): Add SSA interpreter for testing SSA\n(https://github.com/noir-lang/noir/pull/8115)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-02T10:45:35Z",
          "tree_id": "0ef14af234f08e53694e5060525c84a643b7223a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/19da0fb437f338e2e5fc1ecbca7eb9feb3a03227"
        },
        "date": 1746186478209,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619054,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50559,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188050,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183363,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194360,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189674,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204008,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199322,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210319,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205633,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144083,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139396,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150393,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145707,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160041,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155355,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166352,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341725,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146212,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141525,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162170,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157484,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102245,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97558,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108555,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118203,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113517,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94852,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "ilyas@aztecprotocol.com",
            "name": "Ilyas Ridhuan",
            "username": "IlyasRidhuan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5276489d0e271fe1d852518dfb46577e6413534e",
          "message": "feat!: swap copyOffset and dataOffset operands (#14000)\n\nSimilar to the changes to return / revert. \n\nThe copySizeOffset and dataOffset operands are swapped for cdCopy,\nrdCopy and Call to match retrun/revert",
          "timestamp": "2025-05-02T11:16:17Z",
          "tree_id": "6ff9bdfd892b1e351bad1d5adcecd86dccc7a264",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5276489d0e271fe1d852518dfb46577e6413534e"
        },
        "date": 1746188069011,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619054,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50559,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188050,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183363,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194360,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189674,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204008,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199322,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210319,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205633,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144083,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139396,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150393,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145707,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160041,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155355,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166352,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341725,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146212,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141525,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162170,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157484,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102245,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97558,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108555,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118203,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113517,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94852,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "1fb70a4a983da2fd775f833b45ec4d83f5a2b08b",
          "message": "feat(avm): Evolve public data read to read/write (#13486)\n\nEvolves the public data read gadget to a checker gadget with both read\nand write. It's very similar to the nullifier one but handling the\nupdate case instead of failing in that case.\n\n---------\n\nCo-authored-by: jeanmon <jean@aztec-labs.com>",
          "timestamp": "2025-05-02T13:26:33Z",
          "tree_id": "760daad76b3d4a843a843e2c7e98cdc41836f70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1fb70a4a983da2fd775f833b45ec4d83f5a2b08b"
        },
        "date": 1746197153483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619054,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50559,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188050,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183363,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194360,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189674,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204008,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199322,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210319,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205633,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144083,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139396,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150393,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145707,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160041,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155355,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166352,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341725,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146212,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141525,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162170,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157484,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102245,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97558,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108555,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118203,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113517,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94852,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "9d1d63c91860d2a8d8274fd1761efe0c419f5c12",
          "message": "fix!: fix hiding circuit VK consistency in overflow case (#14011)\n\nPrior to this update, the PG recursive verifier was not treating the\ncircuit size and log circuit size as witnesses. This led to the\n`padding_indicator_array` used in the decider recursive verifier in the\nhiding circuit being populated with constant values. This is turn led to\ndifferent constraints in the case where the accumulator had a circuit\nsize larger than the nominal one determined by the structured trace\n(which occurs when the overflow mechanism is active for example).\n\nThis PR makes those values witnesses and adds an additional CIVC VK\nconsistency test for the case where one or more of the circuits\noverflows and results in an accumulator with larger dyadic size than the\nnominal structured trace dyadic size.\n\n---------\n\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-05-02T13:39:15Z",
          "tree_id": "8607a58002fc04b33e1853e470161e1fa299b66d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d1d63c91860d2a8d8274fd1761efe0c419f5c12"
        },
        "date": 1746197959696,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619054,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50559,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188050,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183363,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194360,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189674,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204008,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199322,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210319,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205633,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144083,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139396,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150393,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145707,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160041,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155355,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166352,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341725,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146212,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141525,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162170,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157484,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102245,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97558,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108555,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118203,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113517,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94852,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9d35213a970dede4c094f639754f6ac058cf3b1e",
          "message": "fix: pippenger buffer overflow if threads > 128 (#14039)\n\nGiven how heavy MSMs are, this was definitely a bad micro-optimization.\nIt was missing an assert, at the least. Added one for round count.",
          "timestamp": "2025-05-02T19:26:51Z",
          "tree_id": "2d3f48f01a799820f0a048973a741d7974155977",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d35213a970dede4c094f639754f6ac058cf3b1e"
        },
        "date": 1746218759531,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 80375,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 619054,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 50559,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 95825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 269263,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 257693,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 200658,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 188050,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 183363,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 194360,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 189674,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 204008,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 199322,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 210319,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 205633,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 144083,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 139396,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 150393,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 145707,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 160041,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 155355,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 166352,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 161666,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 341725,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 146212,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 141525,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 152522,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 147836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 162170,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 157484,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 168481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 163795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 102245,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 97558,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 108555,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 103869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 118203,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 113517,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 124514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 119828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 94852,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 36351,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 31736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 50803,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "6bf07d407f2d797152d9251c3c1654efd4240102",
          "message": "fix: Fixing PG recursive verifier FS break (#14004)\n\nThere was a\n[vulnerability](https://github.com/AztecProtocol/barretenberg/issues/1381)\nbreaking the soundness of PG recursive verifier which could allow\ncompletely breaking Client IVC. This fixes it.\n\nCloses: https://github.com/AztecProtocol/barretenberg/issues/1381\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-02T21:27:18Z",
          "tree_id": "75f8bc1191530b04bd765caa400df6b65eb63b19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bf07d407f2d797152d9251c3c1654efd4240102"
        },
        "date": 1746225958209,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cc98a3cb59569f35c846b03fd8780c801fc17a33",
          "message": "fix: PR test cache (#14051)",
          "timestamp": "2025-05-02T20:11:37-04:00",
          "tree_id": "da3488503c99a82b3949158aa4fd23d7207a9a8d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc98a3cb59569f35c846b03fd8780c801fc17a33"
        },
        "date": 1746231939709,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "7b26feb0ff14931540d81feaade10e6cca90ffd8",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2d830cc52a\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2d830cc52a\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-03T02:30:30Z",
          "tree_id": "005d1d58fe536c8c4368eca72cfa17ef47f09a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b26feb0ff14931540d81feaade10e6cca90ffd8"
        },
        "date": 1746241529159,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mike@aztecprotocol.com",
            "name": "Michael Connor",
            "username": "iAmMichaelConnor"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1099e51d49f0ee30cab8f9984dbcfa024bf80c93",
          "message": "docs: update limitations doc (#14035)\n\nI noticed the \"Limitations\" section of the docs is out of date; it looks\nthe same as September '23 when we made the Sandbox release.\n\nEncouragingly, the number of \"Limitations\" has greatly reduced since\nthen, so I've deleted lots of sections that aren't true anymore. We've\nmade progress! I wanted to quickly make these changes, to avoid giving\nreaders the wrong impression about our progress.\n\ncc @AztecProtocol/devrel - please could someone review?\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-05-03T12:59:21Z",
          "tree_id": "93889a756909d3df17efe7e6ef57b97329f2efe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1099e51d49f0ee30cab8f9984dbcfa024bf80c93"
        },
        "date": 1746279027953,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "90371338+0xmoei@users.noreply.github.com",
            "name": "Moei",
            "username": "0xmoei"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "139d3ee944b7303f77de42600bbae24eac13dfb3",
          "message": "chore(docs): update how_to_run_sequencer.md (#14056)\n\n- Added `docker` to the list of installation dependencies.\n- Replaced `curl ifconfig.me` with `curl ipv4.icanhazip.com` to\nexplicitly query the IPv4 address.\n- Updated `docker-compose.yml` to use the latest image version.\n\n---------\n\nCo-authored-by: Maddiaa0 <47148561+Maddiaa0@users.noreply.github.com>",
          "timestamp": "2025-05-03T18:40:02Z",
          "tree_id": "0655bdcdbce7ef88ec62a6048f5abee2424646bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/139d3ee944b7303f77de42600bbae24eac13dfb3"
        },
        "date": 1746299477901,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "02866bd7d78ee998c7a1c11c83768a40888efb26",
          "message": "fix(docs): Update JS tutorials to fix versions (#14053)\n\n- adds versioning to aztec.js tutorials",
          "timestamp": "2025-05-04T02:18:51Z",
          "tree_id": "e05990096767158236c8c36d8ec518f59e3dc932",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/02866bd7d78ee998c7a1c11c83768a40888efb26"
        },
        "date": 1746327122398,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "697664f8d8c2f93cc18b22a1b1ed42c5509f04ce",
          "message": "chore: redo typo PR by Dalu26 (#14062)\n\nThanks Dalu26 for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14059. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-04T12:50:00Z",
          "tree_id": "84abc388608b8fe046cb78c62abdca1e8f6bb62d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/697664f8d8c2f93cc18b22a1b1ed42c5509f04ce"
        },
        "date": 1746364892319,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "186cd73e2452ae7b186a194ddc0e869df977b660",
          "message": "chore: redo typo PR by destinyae (#14064)\n\nThanks destinyae for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14038. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-04T13:33:50Z",
          "tree_id": "c563d4bc47f5a0b3f013a8656565d49bc9427686",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/186cd73e2452ae7b186a194ddc0e869df977b660"
        },
        "date": 1746367487711,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "0d7ac951b5ef57793ced48664757b632e30a209b",
          "message": "chore: redo typo PR by destinyae (#14063)\n\nThanks destinyae for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14040. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-04T13:41:15Z",
          "tree_id": "43ead3b4fbf0a24a41893b3b90d9bc63b253ad73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d7ac951b5ef57793ced48664757b632e30a209b"
        },
        "date": 1746367917127,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "5ba8087ea618eafe0cbbac3cca6a7c9c8a201ddf",
          "message": "chore(docs): replace exact alpha-testnet tags with dist tag (#14067)\n\n## Overview\n\nfixy wixy\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-05-04T20:04:34Z",
          "tree_id": "9605e553869a52526381fdb95ee271d66c69732e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ba8087ea618eafe0cbbac3cca6a7c9c8a201ddf"
        },
        "date": 1746390900052,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "2bad509b28836ba581bb65d04177310814a31bdc",
          "message": "chore(docs): Add sequencer requirements to docs (#14070)\n\nadd sequencer requirements",
          "timestamp": "2025-05-04T21:02:51Z",
          "tree_id": "61095ef9ec38eb7144c27ac24f23d41c7b7067b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2bad509b28836ba581bb65d04177310814a31bdc"
        },
        "date": 1746394431378,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "f6a77748ac3d1779f16d5695447f434ea27d10d8",
          "message": "feat!: improving perf insights + avoid simulating on proving (#13928)\n\nIntroduces new timing info in`profileTx`, but in the process got\ndistracted by a few things, so I'm branching this off before adding more\nbenchmarks:\n\n- Adds a contract deployment benchmark to our key flows\n- Avoids resimulating kernels (in brillig) before proving. We're going\nto do witgen anyways! This should improve our performance across the\nboard. Simulation is still recommended, but that's left as a wallet\nresponsibility\n- Allows playground to profile txs taking into account fee payments\nand/or authwits\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-05-05T06:56:12Z",
          "tree_id": "1d7996c4d2a2d73f3cf2a8d35dedd2a092be208f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f6a77748ac3d1779f16d5695447f434ea27d10d8"
        },
        "date": 1746430189714,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "6728664dc8924d0ddb7cf8312df8be3926395af3",
          "message": "fix: e2e_fees (#14075)\n\nIncorrectly flagged as flake",
          "timestamp": "2025-05-05T08:11:11Z",
          "tree_id": "a22499d12a4e3818222c4075ed4ada749aea44a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6728664dc8924d0ddb7cf8312df8be3926395af3"
        },
        "date": 1746434585802,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "c4602e1c898504106fa4ebf5d0c96f9a343aaa69",
          "message": "chore: avoid unnecesary async chunks (#14076)\n\nMaster version of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/14074",
          "timestamp": "2025-05-05T08:13:58Z",
          "tree_id": "16d899fcc1b8a11abf2f38a1eb05639ce0d2bcc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4602e1c898504106fa4ebf5d0c96f9a343aaa69"
        },
        "date": 1746435183660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "45655999+wim-web@users.noreply.github.com",
            "name": "wim",
            "username": "wim-web"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f1c99de9255226e22bdebcc2c24ef4fc0473e21e",
          "message": "chore: Fix Docker Compose configuration (#14061)\n\nThis PR corrects the docker-compose.yml for the aztec-node setup by\nmoving and properly scoping the network_mode and volumes settings under\nthe node service.\n\nChanges:\n• Relocated network_mode: host from top‐level services to the node\nservice.\n• Ensured the volumes mapping is indented under node rather than at the\nsame level as the service.\n\nThese adjustments ensure Docker Compose correctly applies host\nnetworking and volume mounts to the Aztec protocol node container.",
          "timestamp": "2025-05-05T10:03:31Z",
          "tree_id": "3267b0d35780b31198e88809403fbe8c1a2e47f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1c99de9255226e22bdebcc2c24ef4fc0473e21e"
        },
        "date": 1746441311050,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "8d500b676810631e941c8ae08def041540b43ff9",
          "message": "chore: redo typo PR by samdotola (#14078)\n\nThanks samdotola for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14068. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-05T14:19:04Z",
          "tree_id": "71515d763a13313ef4e258b081de36bc6687455c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d500b676810631e941c8ae08def041540b43ff9"
        },
        "date": 1746456634561,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "id": "7012aebf69ed546c3576eb32bad70c88d9cf8400",
          "message": "fix: Error enriching after noir changes (#14080)\n\nUpdates our error enrichment code after the changes in noir to use a\nlocations tree. Partially based on\nhttps://github.com/AztecProtocol/aztec-packages/pull/14016",
          "timestamp": "2025-05-05T16:25:52Z",
          "tree_id": "c8d99d9e28aa5e4c98da06e4aea8d63735f0c4bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7012aebf69ed546c3576eb32bad70c88d9cf8400"
        },
        "date": 1746464276900,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
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
          "distinct": false,
          "id": "775f6f475fe4f9858fcf3bf6879bcf3b61e25720",
          "message": "chore: redo typo PR by gap-editor (#14079)\n\nThanks gap-editor for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14069. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-05T17:27:34Z",
          "tree_id": "6d12c662da76a9c9ac5444f18ef886aabe7c9f32",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/775f6f475fe4f9858fcf3bf6879bcf3b61e25720"
        },
        "date": 1746467997951,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "shramee.srivastav@gmail.com",
            "name": "Shramee Srivastav",
            "username": "shramee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "a1148b3be9a434579f8b722e138c0e49f9737b33",
          "message": "feat(bb.js): Enable more ZK flavors (#14072)\n\nZK flavors are not included in the generated WASM. This PR adds 'em.\n\n<img width=\"418\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/a8f38ff6-62d0-4124-9115-b96a12414e78\"\n/>\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-05T18:23:14Z",
          "tree_id": "c6ae290ba20e5c3eb0d5e92e8be2149944d83bd4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1148b3be9a434579f8b722e138c0e49f9737b33"
        },
        "date": 1746473352330,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bb78059a896a4e8332054075e98cff4d00f6920a",
          "message": "fix(bb): solve memory blowup, acir::Opcode 7kb => 386 bytes (#14042)\n\nAdded a script that can be run after acir generations, until\nhttps://github.com/zefchain/serde-reflection/issues/75 has attention\nThe issue is that we have a giant enum over these static arrays. In\nRust, they are `Box<... array ...>`, which would be `std::unique_ptr<...\narray ...>` in C++. We have an issue open to do just this - but\nmeanwhile, the more practical move is to use std::shared_ptr to avoid\nfurther changes.\n\nAlso uses std::move more to reduce time and allocation.",
          "timestamp": "2025-05-05T23:29:12Z",
          "tree_id": "ebd4b6cd572da6e0b7168f962739c9b1ff4cc4ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bb78059a896a4e8332054075e98cff4d00f6920a"
        },
        "date": 1746491491512,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "parity_base",
            "value": 30670,
            "unit": "gates"
          },
          {
            "name": "parity_root",
            "value": 2941917,
            "unit": "gates"
          },
          {
            "name": "private_kernel_init",
            "value": 41308,
            "unit": "gates"
          },
          {
            "name": "private_kernel_inner",
            "value": 91320,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset",
            "value": 624527,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_0_64_0_0_0",
            "value": 56032,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_0_64_0_0_0_0",
            "value": 101298,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_0_64_0_0_0_0_0",
            "value": 274736,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_0_64_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_0_64_0_0_0_0_0_0_0",
            "value": 263166,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_16_16_16_16_16_16_16_16_16",
            "value": 206131,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_32",
            "value": 193523,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_4_4",
            "value": 188836,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_32",
            "value": 199833,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_4_64_4",
            "value": 195147,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_32",
            "value": 209481,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_4_4",
            "value": 204795,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_32",
            "value": 215792,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_16_4_4_64_64_4",
            "value": 211106,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_32",
            "value": 149556,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_4_4",
            "value": 144869,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_32",
            "value": 155866,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_4_64_4",
            "value": 151180,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_32",
            "value": 165514,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_4_4",
            "value": 160828,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_32",
            "value": 171825,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_16_32_4_4_4_64_64_4",
            "value": 167139,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_32_32_32_32_32_32_32_32",
            "value": 347198,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_32",
            "value": 151685,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_4_4",
            "value": 146998,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_32",
            "value": 157995,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_4_64_4",
            "value": 153309,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_32",
            "value": 167643,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_4_4",
            "value": 162957,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_32",
            "value": 173954,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_16_4_4_64_64_4",
            "value": 169268,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_32",
            "value": 107718,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_4_4",
            "value": 103031,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_32",
            "value": 114028,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_4_64_4",
            "value": 109342,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_32",
            "value": 123676,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_4_4",
            "value": 118990,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_32",
            "value": 129987,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_32_4_32_4_4_4_64_64_4",
            "value": 125301,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_4_4_4_4_4_4_4_4_4",
            "value": 100325,
            "unit": "gates"
          },
          {
            "name": "private_kernel_reset_64_0_0_0_0_0_0_0_0",
            "value": 41824,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail",
            "value": 37209,
            "unit": "gates"
          },
          {
            "name": "private_kernel_tail_to_public",
            "value": 56276,
            "unit": "gates"
          },
          {
            "name": "rollup_base_private",
            "value": 1968342,
            "unit": "gates"
          },
          {
            "name": "rollup_base_public",
            "value": 1431353,
            "unit": "gates"
          },
          {
            "name": "rollup_block_merge",
            "value": 1609922,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root",
            "value": 4756897,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_empty",
            "value": 774705,
            "unit": "gates"
          },
          {
            "name": "rollup_block_root_single_tx",
            "value": 3960333,
            "unit": "gates"
          },
          {
            "name": "rollup_merge",
            "value": 1530118,
            "unit": "gates"
          },
          {
            "name": "rollup_root",
            "value": 26866078,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}