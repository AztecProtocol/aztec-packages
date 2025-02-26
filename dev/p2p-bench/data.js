window.BENCHMARK_DATA = {
  "lastUpdate": 1740563543181,
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
      }
    ]
  }
}