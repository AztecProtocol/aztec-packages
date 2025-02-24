window.BENCHMARK_DATA = {
  "lastUpdate": 1740407867356,
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
      }
    ]
  }
}