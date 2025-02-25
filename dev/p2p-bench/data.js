window.BENCHMARK_DATA = {
  "lastUpdate": 1740482495791,
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
      }
    ]
  }
}