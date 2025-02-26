window.BENCHMARK_DATA = {
  "lastUpdate": 1740612130214,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "P2P Testbench": [
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "d742834bb55548a1bc94a773b1eb40e8c9b397ae",
          "message": "feat(p2p): gossipsub scoring adjustments + testbench in ci",
          "timestamp": "2025-02-23T02:27:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/12075/commits/d742834bb55548a1bc94a773b1eb40e8c9b397ae"
        },
        "date": 1740393350532,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 48,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 2474,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 991.75,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1074,
            "unit": "ma"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 16,
            "unit": "ma"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 61,
            "unit": "ma"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 3997,
            "unit": "ma"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 410,
            "unit": "ma"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 120,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 27,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 51,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7336,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 4271.78,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 4733,
            "unit": "ma"
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
          "id": "ec7d34987bca0c42c5e0ba5cced2f29d42cc65db",
          "message": "chore!: Remove msm opcode (#12192)\n\nThe MSM opcode is now transpiled to a procedure that implements it via\necadd. We can safely remove it now.",
          "timestamp": "2025-02-24T15:04:12+01:00",
          "tree_id": "8b62fd6280f24370f78325850652091d5f84751b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec7d34987bca0c42c5e0ba5cced2f29d42cc65db"
        },
        "date": 1740407866202,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 50,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1776,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 820.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1077,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 13,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 60,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 4703,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 427.69,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 67,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 34,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 50,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7203,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2592.24,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1390,
            "unit": "ms"
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
          "id": "8f121f8355e84a31ca08a56a829f8c545f058ff7",
          "message": "chore(p2p): run testbench with 200kb transactions (#12218)\n\n## Overview\n\nBumps transactions size use random ClientIVC proofs in testbench \n\n```\nconst CLIENT_IVC_PROOF_LENGTH = 172052;\nconst CLIENT_IVC_VK_LENGTH = 2730;\n```",
          "timestamp": "2025-02-24T15:19:11Z",
          "tree_id": "8de9e7028424ad42c564f1feb594d50c62bc4fa6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f121f8355e84a31ca08a56a829f8c545f058ff7"
        },
        "date": 1740412099044,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 2,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 521,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1921,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 1221,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1921,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 31,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 139,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7239,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 4566.1,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 5440,
            "unit": "ms"
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
          "id": "4bd5678f840694333725aed44e00ced576ef9950",
          "message": "chore: @aztec/stdlib pt.5 -> started circuit-types minification (#12232)\n\nInitial cleanup of `circuit-types`. Attempted to do more in one go, but\nthe trees were pretty much all over the place.",
          "timestamp": "2025-02-24T17:24:46+01:00",
          "tree_id": "7ec7da89509a7e6936083fe1932136b10a2128b1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4bd5678f840694333725aed44e00ced576ef9950"
        },
        "date": 1740416160557,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 397,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1795,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 1098.67,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1104,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 6,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 236,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 464,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 346.83,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 426,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 22,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 204,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7993,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 5894.09,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 6965,
            "unit": "ms"
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
          "id": "b2b5589cacc926fcb7a6a5ec1dbc5fdf023b65cc",
          "message": "chore(p2p): remove debug disable message validators  (#12237)",
          "timestamp": "2025-02-25T10:52:20Z",
          "tree_id": "a05b0337153e74e34666a9600b5824be62ae3489",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b2b5589cacc926fcb7a6a5ec1dbc5fdf023b65cc"
        },
        "date": 1740482494510,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 345,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 496,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 398.33,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 354,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 29,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 234,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7027,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 3322.97,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 3992,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d94bc3d56b7d516ca7cf99df21c21edd556710d",
          "message": "feat: compress/decompress redis logs (#12243)\n\nShould save quite a bit of space, hopefully giving the data a longer\nlifetime before eviction.\nHandles both compressed and uncompressed logs.",
          "timestamp": "2025-02-25T12:07:42Z",
          "tree_id": "7d24a70d8afb07bdd4c1fee60f1156fcb160c4d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d94bc3d56b7d516ca7cf99df21c21edd556710d"
        },
        "date": 1740486205464,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 122,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 432,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 249,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 278,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 48,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 152,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6421,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2051.31,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 863,
            "unit": "ms"
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
          "id": "9139ffb905d2ac9740121b6ef249607ca3302e1d",
          "message": "fix: Node getBlockHeader returns undefined for non-existent blocks (#12242)\n\nAztec node's `getBlockHeader` returned the initial genesis header when\nqueried for a non-existing block.",
          "timestamp": "2025-02-25T09:10:26-03:00",
          "tree_id": "386f4e50b530145dcdc966122850987cd68fa786",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9139ffb905d2ac9740121b6ef249607ca3302e1d"
        },
        "date": 1740487192672,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 143,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1027,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 473.75,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 426,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 14,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 173,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 3368,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 631.93,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 500,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 210,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6650,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2080.49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1413,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1a34cdf8c456533cdc7a3e3bf59e396a5e139f0e",
          "message": "feat: Cl/ci3.4 (#12018)\n\n* Introduces \"skipped\" test log so you can see a list of all skipped\ntests, with log links to their successful run.\n* Test logs have metadata added in the header (command, commit link, env\nvars, date).\n* CI docs around approach to reproducing flakes.\n* Denoise logs can now be \"live tailed\" with `ci llog <id>`.\n* Logs for local (non CI) runs expire within 8 hours. CI logs retained\nfor 14 days.\n* Denoise logs use a temp file rather than ephermeral file descriptor,\nwhich I'm moon-shot hoping will fix the \"hanging CI machine after\nfailure\" issue (existing code never closed the fd).\n* Only put anvil in release-image rather than all of foundry (slight\nimage space save).\n* Make the p2p e2e tests \"grindable\" by using unique data dirs.",
          "timestamp": "2025-02-25T15:14:53Z",
          "tree_id": "829b3b41216372fff7c0a32050a837d600237bb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a34cdf8c456533cdc7a3e3bf59e396a5e139f0e"
        },
        "date": 1740498319676,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 414,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 698,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 544.67,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 522,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 228,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6978,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1612.27,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1011,
            "unit": "ms"
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
          "id": "63081a4f7279a29d020c78cd15635ae618d771d3",
          "message": "refactor!: note interfaces (#12106)",
          "timestamp": "2025-02-26T00:17:59Z",
          "tree_id": "9ec1278af6e17a7d3319a1cc2fd3a8349438425b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/63081a4f7279a29d020c78cd15635ae618d771d3"
        },
        "date": 1740530796642,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 2,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 414,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 521,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 467.5,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 521,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 11,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 263,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 683,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 448,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 479,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 32,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 275,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6925,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 3592.44,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 4383,
            "unit": "ms"
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
          "id": "83214fcb0bacb0c596b17c321ea99a280ad2147a",
          "message": "fix: Enforce no import side effects (#12268)\n\nSince we enabled `verbatimModuleSyntax` in yarn project, all imports of\nthe like `import { type Foo } from './foo.js'` now cause `foo.js` to be\nactually imported in runtime. To prevent this, the `type` modifier needs\nto be moved out of the braces. This is what this eslint rule does.\n\nSee [this\npost](https://typescript-eslint.io/blog/consistent-type-imports-and-exports-why-and-how/#verbatim-module-syntax)\nfor more info.",
          "timestamp": "2025-02-26T01:06:57Z",
          "tree_id": "5f14cd84c456dfa7ab82b431eecca9e83333a1bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/83214fcb0bacb0c596b17c321ea99a280ad2147a"
        },
        "date": 1740533925714,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 127,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1118,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 612.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 950,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 15,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 2342,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 3029,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 2677.87,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 2766,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6565,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1986.55,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 673,
            "unit": "ms"
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
          "id": "9ccd2c9cb9a1a932dd22eae16c64288cc0ff24af",
          "message": "chore: cleanup stdlib internal imports (#12274)\n\nThanks @sklppy88 for the heads up!",
          "timestamp": "2025-02-26T07:47:21+01:00",
          "tree_id": "accb17e2f13fe1e3e3844cde294cb2db0dc7e737",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ccd2c9cb9a1a932dd22eae16c64288cc0ff24af"
        },
        "date": 1740554535320,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 128,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 488,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 276.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 305,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 234,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6185,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1750.37,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 767,
            "unit": "ms"
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
          "id": "7c3eed09c11e59006cc7f6b80693264f32819420",
          "message": "feat: metrics (#12256)\n\nMore metrics fixes",
          "timestamp": "2025-02-26T08:52:52Z",
          "tree_id": "ed840dbb33f973f75f40d74af319408721fd268f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7c3eed09c11e59006cc7f6b80693264f32819420"
        },
        "date": 1740561676613,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 2,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 387,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 391,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 389,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 391,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 5,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 537,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 1050,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 748.6,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 720,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 249,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 8055,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1882.27,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 602,
            "unit": "ms"
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
          "id": "f887efc9c47a643e6eba4aaabafdeef46c77ff4a",
          "message": "fix: prometheus scrapes itself in the cluster (#12277)",
          "timestamp": "2025-02-26T09:29:17Z",
          "tree_id": "074d8fd895c0e70cbc13d3444349b8d9d40735ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f887efc9c47a643e6eba4aaabafdeef46c77ff4a"
        },
        "date": 1740563542246,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 106,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 271,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 188.5,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 222,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 14,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 221,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 535,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 374.43,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 422,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 178,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 5279,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1864.29,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 873,
            "unit": "ms"
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
          "id": "5da66c833f25fcd72b611f6de75e2040554bc475",
          "message": "refactor: proving cost in fee header (#12048)",
          "timestamp": "2025-02-26T10:39:37Z",
          "tree_id": "955f02b4219c5376e8d9deaa2c40e94694e0fc84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5da66c833f25fcd72b611f6de75e2040554bc475"
        },
        "date": 1740567941914,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 106,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 524,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 315.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 425,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 1,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 1246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 1246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 1246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 1246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 226,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6769,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2255.8,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1136,
            "unit": "ms"
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
          "id": "5d49445812dca3405805d92c9236f90236b3ce98",
          "message": "docs: Fees doc snippets and code snippets (#12229)",
          "timestamp": "2025-02-26T11:06:12Z",
          "tree_id": "a78a223ab01d242e5530be89da7f384b70ea9e5e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d49445812dca3405805d92c9236f90236b3ce98"
        },
        "date": 1740569730880,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 408,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1442,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 788.67,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 516,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 184,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7243,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2472.71,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1307,
            "unit": "ms"
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
          "id": "a20da9b93ea76b9a02fc8447303a833b173578b9",
          "message": "fix: darwin build (#12290)\n\nCo-authored-by: IlyasRidhuan <ilyasridhuan@gmail.com>",
          "timestamp": "2025-02-26T17:11:31Z",
          "tree_id": "45bb4b1107e6c6ba6444bc0e6b88d301ecec7ec7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a20da9b93ea76b9a02fc8447303a833b173578b9"
        },
        "date": 1740592271868,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 110,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 535,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 343.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 426,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 171,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6630,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2314.1,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 791,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b0de9e8d58f93d149e59cf3ca7ac81bf51b68e12",
          "message": "feat: live logs (#12271)\n\nWe publish denoise logs to redis every 5s.",
          "timestamp": "2025-02-26T17:32:49Z",
          "tree_id": "4e4ecc8d6dbbc9539362f73b950127d701ca93b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b0de9e8d58f93d149e59cf3ca7ac81bf51b68e12"
        },
        "date": 1740592709378,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 357,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1088,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 640.67,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 477,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 44,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 187,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6581,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1871.73,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1135,
            "unit": "ms"
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
          "id": "a90f08e245add379fa0257c81f8e2819beb190cb",
          "message": "feat: fetch addresses from registry (#12000)\n\nKey changes:\n- Makes slash factory address optional in L1ContractAddresses interface\n- Adds new RegisterNewRollupVersionPayload contract for registering new rollup versions\n- Adds new Registry contract with methods for managing rollup versions\n- Extracts rollup deployment logic into separate deployRollupAndPeriphery function\n- Adds collectAddresses and collectAddressesSafe methods to Registry for fetching contract addresses\n- Transfers fee asset ownership to coin issuer during deployment",
          "timestamp": "2025-02-26T12:34:14-05:00",
          "tree_id": "343a179b8001ae3dcd48c1ceceef46860b9ffca8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a90f08e245add379fa0257c81f8e2819beb190cb"
        },
        "date": 1740593083108,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 111,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 860,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 536.5,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 759,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 13,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 367,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 6447,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 905.15,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 376,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 215,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6565,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1685.88,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 573,
            "unit": "ms"
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
          "id": "6749596f41f45b566bedf58c9c5f5a5fdca2ac11",
          "message": "feat: prepend based merge (#12093)\n\nReorganize the existing merge protocol to establish the _pre_-pending of\nsubtables of ecc ops from each circuit, rather than appending. This is\nfacilitated by classes `UltraEccOpsTable` and `EccvmOpsTable`\n(implemented in a previous PR) that handle the storage and virtual\npre-pending of subtables.\n\nThe merge protocol proceeds by opening univariate polynomials T_j,\nT_{j,prev}, and t_j (columns of full table, previous full table, and\ncurrent subtable respectively) and checking the identity T_j(x) = t_j(x)\n+ x^k * T_{j,prev}(x) at a single challenge point. (Polynomials t_j are\nexplicitly degree checked in main protocol via a relation that checks\nthat they are zero beyond idx k-1).\n\nNote: Missing pieces in the merge are (1) connecting [t] from the main\nprotocol to [t] in the merge and (2) connecting [T] from step i-1 to\n[T_prev] at step i. These will be handled in follow ons.",
          "timestamp": "2025-02-26T11:01:31-07:00",
          "tree_id": "d25cf6fad7b3b5b413f7e8a87456044865c3d14a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6749596f41f45b566bedf58c9c5f5a5fdca2ac11"
        },
        "date": 1740595398019,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 149,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 521,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 365.5,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 413,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 5,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 327,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 7893,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 2097.4,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 523,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 268,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7289,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2064.16,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 653,
            "unit": "ms"
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
          "id": "cc0130ab2626421ef537da0069fcac72a8291cce",
          "message": "chore: enabling `e2e_contract_updates` in CI + nuking irrelevant test (#12293)",
          "timestamp": "2025-02-26T18:12:00Z",
          "tree_id": "4336394ad3dbd91cb0609a8c368d88e35b087b4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc0130ab2626421ef537da0069fcac72a8291cce"
        },
        "date": 1740595494143,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 113,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1172,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 674.5,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1055,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 5,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 352,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 529,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 408.4,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 367,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 232,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6588,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2017.96,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 798,
            "unit": "ms"
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
          "id": "e200f8bec616608557bfc170732e126fa4866472",
          "message": "feat: Sync from noir (#12298)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore!: bump msrv to 1.85.0\n(https://github.com/noir-lang/noir/pull/7530)\nfix: No longer error on INT_MIN globals\n(https://github.com/noir-lang/noir/pull/7519)\nfix: correctly format trait function with multiple where clauses\n(https://github.com/noir-lang/noir/pull/7531)\nchore(ssa): Do not run passes on Brillig functions post Brillig gen\n(https://github.com/noir-lang/noir/pull/7527)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: guipublic <guipublic@gmail.com>\nCo-authored-by: guipublic <47281315+guipublic@users.noreply.github.com>",
          "timestamp": "2025-02-26T18:30:44Z",
          "tree_id": "f92b615b79884a0cd9e8c6aeb900d95a8486a23d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e200f8bec616608557bfc170732e126fa4866472"
        },
        "date": 1740596533671,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 113,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1557,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 777.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 772,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 213,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6738,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1886.76,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 763,
            "unit": "ms"
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
          "id": "2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57",
          "message": "fix(e2e): p2p_reqresp (#12297)",
          "timestamp": "2025-02-26T19:05:13Z",
          "tree_id": "210d9d8fdf8dd792fd4e69f1a3eaa569edd6f10c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57"
        },
        "date": 1740598522897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 1,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 1524,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1524,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 1524,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 1524,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 18,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 140,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 12981,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 6879.89,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 6577,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 269,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 8038,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1938.8,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 634,
            "unit": "ms"
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
          "id": "f59f91e450e481981b374e9209304789f54d6d22",
          "message": "chore: Do not set CI_FULL outside CI (#12300)\n\nDo not set the CI_FULL env var if running outside CI",
          "timestamp": "2025-02-26T16:26:10-03:00",
          "tree_id": "bad4bd99d2f608711361c5d7d47bdce1a6c69a49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f59f91e450e481981b374e9209304789f54d6d22"
        },
        "date": 1740599602773,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 113,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 540,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 350.75,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 434,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 10,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 175,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 482,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 333.9,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 375,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 210,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6255,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2568.1,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 2697,
            "unit": "ms"
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
          "id": "fcf6278d376e9393d242d6c68f4df5d738ce75ab",
          "message": "chore!: enable multiple L1 nodes to be used (#11945)\n\n- Updates `ETHEREUM_HOST` env var to `ETHEREUM_HOSTS`. Using a single\nhost should still work as it did before\n- Single `ViemWalletClient` & `ViemPublicClient`\n\nBREAKING CHANGE:\n- env var `ETHEREUM_HOST` -> `ETHEREUM_HOSTS`\n- CLI arg `--l1-rpc-url` -> `--l1-rpc-urls`\n- TypeScript configs with `l1RpcUrl` -> `l1RpcUrls`\n- aztec.js functions with `l1RpcUrl` -> `l1RpcUrls`\n- `DeployL1Contracts` (type) -> `DeployL1ContractsReturnType`\n\nFixes #11790 \n\nFollow-up #12254",
          "timestamp": "2025-02-26T19:23:15Z",
          "tree_id": "41392dcf4b4e30c692d15e1c644bad2d97ebda3c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fcf6278d376e9393d242d6c68f4df5d738ce75ab"
        },
        "date": 1740599608237,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 1,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 950,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 950,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 950,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 950,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 10,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 251,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 6471,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 998.8,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 476,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 275,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7017,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2026.94,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 790,
            "unit": "ms"
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
          "id": "62faad5cf843bcc0655ac98f2dec8e7bc2378e29",
          "message": "chore: new mnemonic deployments on sepolia (#12076)\n\nFixes #11765 \nUpdating how we make sepolia deployments on k8s. \nInstead of fixed pre-funded addresses, we have a single private key that\nfunds new addresses for each new deployment.\nAlso fixes setting up the transaction bot for sepolia deployments",
          "timestamp": "2025-02-26T19:23:51Z",
          "tree_id": "e87c326d376181a2bdf364965ff06562e04c82a6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62faad5cf843bcc0655ac98f2dec8e7bc2378e29"
        },
        "date": 1740599622176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 124,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 1320,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 510,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 354,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 11,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 312,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 671,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 423.55,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 330,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 137,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7939,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 3413.96,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 2870,
            "unit": "ms"
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
          "id": "894273fdbd8e29caa2b0d76dd556ef97d117c8a1",
          "message": "chore: Reenable dapp subscription test (#12304)\n\nFixes #12296\nFixes #6651",
          "timestamp": "2025-02-26T19:47:00Z",
          "tree_id": "092b227b4e163dc24c443a41ca98d77612e66364",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/894273fdbd8e29caa2b0d76dd556ef97d117c8a1"
        },
        "date": 1740600999761,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 302,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 536,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 421.33,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 426,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 123,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6229,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2388.02,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1395,
            "unit": "ms"
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
          "id": "3cb6920eae9814919e135d8715ef445f3c5cc8e0",
          "message": "chore: Lazy loading artifacts everywhere (#12285)\n\nThis PR adds the *option* to lazily load JSON artifacts in all the\npackages that were missing that functionality, further improving bundle\nsizes for the browser and allowing us to finally put limits on our\nexample apps bundle sizes:\n\n* `noir-protocol-circuits-types/vks`: now allow vk lazy imports via the\n`LazyArtifactProvider` in the `/client` export, while maintaining the\nbundled version for the server under `/server/vks`\n* `accounts`: Now all exports provide a lazy version, e.g:\n`@aztec/accounts/schnorr/lazy`. This has proven to be complicated due to\nthe testing import leaking into the browser (where type assertions are\nnot widely supported). Now there's also `/testing/lazy`. This testing\npackage is needed in the browser for the prefunded accounts.\n* `protocol-contracts`: Now with a lazy version and exporting\n`ProtocolContractProviders` so that PXE can be configured with bundled\nand lazy versions.\n\n\nBesides the type assertion issue, we absolutely want to keep bundled and\nlazy versions because some environments don't play well with `await\nimport` (namely service workers in firefox)\n\n---------\n\nCo-authored-by: esau <152162806+sklppy88@users.noreply.github.com>",
          "timestamp": "2025-02-26T19:56:40Z",
          "tree_id": "63024bdc8fea5767ee221e8d0791de57da85da45",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3cb6920eae9814919e135d8715ef445f3c5cc8e0"
        },
        "date": 1740601571438,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 268,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 444,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 348,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 332,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 10,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 355,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 638,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 482.4,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 467,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 206,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 5865,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 1423.33,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 806,
            "unit": "ms"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "31c80347245f030ee6be4313e187cf000861556e",
          "message": "feat!: rename compute_nullifier_without_context (#12308)\n\nFollow up from #12240. This aligns both compute nullifier functions.\nWith the new metadata bits calling this is quite simple, and it's very\nclear that we're only using it for note discovery. Some macros were\nsimplified a bit as a result as well.",
          "timestamp": "2025-02-26T21:24:38Z",
          "tree_id": "654efb8f4f3a2d6ce25a22700ee689b5f2e91474",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/31c80347245f030ee6be4313e187cf000861556e"
        },
        "date": 1740607084729,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 102,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 555,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 328.75,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 435,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 11,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 357,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 6840,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 1078.55,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 432,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 47,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 183,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 6922,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2454.19,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 668,
            "unit": "ms"
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
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "distinct": true,
          "id": "46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56",
          "message": "revert: \"chore: Fix and reenable fees-settings test (#12302)\"\n\nThis reverts commit dbcb2b10ab1b85b675d83613aa527ca088964bd4.",
          "timestamp": "2025-02-26T19:17:27-03:00",
          "tree_id": "01d7b6451214a3eb54b68c5af730391f878988be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56"
        },
        "date": 1740609254254,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 109,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 801,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 488.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 700,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 2,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 317,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 7734,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 4025.5,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 7734,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 149,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7138,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2036.98,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 1778,
            "unit": "ms"
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
          "id": "44748dd058d9fb162bdd9fa2e365e626ad437201",
          "message": "fix: slack notify was broken by quoted commit titles",
          "timestamp": "2025-02-26T15:50:54-07:00",
          "tree_id": "d7999ddd0f0847055a4b53f7f47a636db482c7a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44748dd058d9fb162bdd9fa2e365e626ad437201"
        },
        "date": 1740611232441,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 438,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 779,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 585.33,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 539,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 49,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 223,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7589,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2283.29,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 742,
            "unit": "ms"
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19",
          "message": "feat: Slack message to ci channel tagging owners on flakes. (#12284)\n\n* .test_skip_patterns is now .test_patterns.yml and assigns owners to\ntests.\n* If in CI and a matching test fails, it doesnt fail the build but\nslacks the log to the owner.\n* Some additional denoise header metadata.\n* We still \"fail fast\" when doing a test run locally.",
          "timestamp": "2025-02-26T22:52:21Z",
          "tree_id": "4e461dc26b6f38542403a08ef9a318631b1345d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19"
        },
        "date": 1740612129132,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 4,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 138,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 664,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 451.25,
            "unit": "ms"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 547,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - numberReceived",
            "value": 8,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - minDelay",
            "value": 246,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - maxDelay",
            "value": 936,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - averageDelay",
            "value": 385.25,
            "unit": "ms"
          },
          {
            "name": "normal-degree-100-nodes - medianDelay",
            "value": 264,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 47,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 265,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7314,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2382.89,
            "unit": "ms"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 925,
            "unit": "ms"
          }
        ]
      }
    ]
  }
}