window.BENCHMARK_DATA = {
  "lastUpdate": 1744736659697,
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
          "id": "1994b2ccb3976644074beabeddf708427a2b6700",
          "message": "chore(avm): dont use PIs in simulation (#13409)\n\nWe would not have PIs in standalone simulation. We have to make sure\nthat our inputs either come from the DBs or TX.",
          "timestamp": "2025-04-09T13:22:44Z",
          "tree_id": "8075083f52d03f05c9ca572f055a409bd82f8b35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1994b2ccb3976644074beabeddf708427a2b6700"
        },
        "date": 1744208678854,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10477,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26645804777912546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153865,
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
          "distinct": false,
          "id": "4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34",
          "message": "feat: persist the bot and enable simulation capturing (#13276)\n\nThe bots did not persist their databases because when we first\nintroduced them the pxe did not have reorg support. This should be fine\nnow :)\n\nAlso enables the option of using the recording simulator in the bot's\nPXE for debugging",
          "timestamp": "2025-04-09T14:51:32Z",
          "tree_id": "e8e5db9c1980eebfd7752bd481f67a411fc5f613",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34"
        },
        "date": 1744212450660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10269,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26115074508919084,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140542,
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
          "distinct": false,
          "id": "8dc17ec36e2723958d297b7847af1ec94ff57561",
          "message": "feat: more blob sink metrics (#13413)\n\nThis PR adds more metrics to the blob sink\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-04-09T15:18:10Z",
          "tree_id": "95a2e8af434b94c546de17d6bf355ad1979a0696",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8dc17ec36e2723958d297b7847af1ec94ff57561"
        },
        "date": 1744214049666,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2643113354938142,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151527,
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
          "distinct": false,
          "id": "ff2e7381d344dbfa18be8deff96c61b01e53d6f4",
          "message": "fix: Nondeterminism in constant allocation (#13340)\n\nQuick fix to an issue discovered in testnet. We were having\nnondeterministic contract builds between aarch64 and amd64 builds of the\nnoir compiler, reproduced locally. The iterators generated from the\nFxHashMaps/FxHashSets used in constant_allocation were yielding\ndifferently ordered items. I did log the insertions and the input was in\nthe same order (if the insertion ordering was nondeterministic the\niteration order is expected to be nondeterministic) so I have no idea\nwhat was creating the nondeterminism there. Switched to a\nBTreeMap/BTreeSet in that file and nondeterminism is gone.",
          "timestamp": "2025-04-09T15:22:43Z",
          "tree_id": "1efcb1efecf60c9a6966f88f74de166abb69c434",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff2e7381d344dbfa18be8deff96c61b01e53d6f4"
        },
        "date": 1744214956007,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26539785261289495,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157537,
            "unit": "us"
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
          "id": "33286aeea54ac77a4dc1dd82fba1c63a7c463803",
          "message": "fix: easier description of how to use multiple authwitnesses with cli wallet (#13412)\n\nWas unable to figure out how it worked here from the desc to use\nmultiple authwits in a single tx, so I made it a bit easier to figure\nout and added it in the desc",
          "timestamp": "2025-04-09T15:45:28Z",
          "tree_id": "8e55da863a814017f52e387bfb426cc652e407cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33286aeea54ac77a4dc1dd82fba1c63a7c463803"
        },
        "date": 1744216455788,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10225,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2600473858346468,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147949,
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
          "distinct": false,
          "id": "593541723bd2350745cc40f15b969016e5cf65ba",
          "message": "fix: Use API keys when fetching blobs on missed slot (#13418)\n\nOptional arguments considered harmful.\n\nDue to a missed argument in a recursive call, we were not loading the\nAPI keys for hitting the consensus URL on a missed slot, so any requests\nwould fail with a 4xx if hitting a consensus endpoint that needed keys\n(like GCP's).\n\nFixes #13415",
          "timestamp": "2025-04-09T15:56:15Z",
          "tree_id": "1e4f9136c6fb69525de06f98c47681e01740887c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/593541723bd2350745cc40f15b969016e5cf65ba"
        },
        "date": 1744220582857,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10377,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2638965272272603,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144134,
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
          "distinct": false,
          "id": "ea7eaf5919e84b7abb75cb90839ed22b516c71ad",
          "message": "refactor(avm): getNullifierIndex -> checkNullifierExists (#13414)\n\nChanging only for public, the same can be done for private.\n\nChatted with @nventuro and decided to merge the CommitmentsDB interface\nwith the ExecutionDataProvider interface, since it wasn't used anywhere\nelse.",
          "timestamp": "2025-04-09T16:12:37Z",
          "tree_id": "898c6d70e3376d1a044ca40fd0626415e5fe813c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea7eaf5919e84b7abb75cb90839ed22b516c71ad"
        },
        "date": 1744220641428,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10387,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26414873052761595,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151569,
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
          "distinct": false,
          "id": "ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3",
          "message": "fix: warn if blob sink server can't be reached (#13419)",
          "timestamp": "2025-04-09T16:58:58Z",
          "tree_id": "a4ac5c5c094b65cf401f081d9e6f654a23687185",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3"
        },
        "date": 1744220732017,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10334,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2628073926668328,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147323,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "159419107+DanielKotov@users.noreply.github.com",
            "name": "DanielKotov",
            "username": "DanielKotov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "15d2633d5bb6de55d74f4b8404cd4f009523f708",
          "message": "fix(Barretenberg): shplemini variables in one gate fixes (#13290)\n\nThis PR fixes extra and unconstrained variables in the ultra recursive\nverifier.\n\nExtra variables appeared in the circuit for different reasons. We don't\nfix some places in the circuit because of interleaving (see\nhttps://github.com/AztecProtocol/barretenberg/issues/1293)\n\nAlso static analyzer found unconstrained variables in the circuit:\nnum_public_inputs and pub_inputs_offset were added in the circuit at the\ntime of the creation of verification key.\n\nAlso there was created function to print additional information about\nvariable in one gate for more convenient debugging.\n\n---------\n\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>",
          "timestamp": "2025-04-09T17:00:36Z",
          "tree_id": "930505a65bb045ea4588dc576d310da8532e27e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15d2633d5bb6de55d74f4b8404cd4f009523f708"
        },
        "date": 1744220885980,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2609922088605811,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144627,
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
          "distinct": false,
          "id": "6c23db4ddba5aed447ee44412ce96b3a637c6a7e",
          "message": "chore: bump to forge nightly 2025-04-08 (#12799)\n\nWe want to move to stable forge.\nFix #12742\n\n---------\n\nCo-authored-by: Charlie Lye <5764343+charlielye@users.noreply.github.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-04-09T21:56:56Z",
          "tree_id": "830df1d995d4e366e33fa2f5196ccc570ad6b38c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c23db4ddba5aed447ee44412ce96b3a637c6a7e"
        },
        "date": 1744239307830,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10255,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2607976077557036,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145317,
            "unit": "us"
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
          "id": "866968a79be21d4d64442326bf4e91e2bd05eb69",
          "message": "chore: BoundedVec::for_each (#13426)\n\nNow that this exists in the stdlib we can get rid of our homemade\nreplacement function.",
          "timestamp": "2025-04-09T22:34:43Z",
          "tree_id": "a6ff7604bc9b79d5132d0dab7550cd368cb02f91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/866968a79be21d4d64442326bf4e91e2bd05eb69"
        },
        "date": 1744241523469,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10380,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2639823533076461,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148823,
            "unit": "us"
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
          "id": "772259aa081e102ff0b4b57f68019c275afbb93b",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"b32f8e9b47\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"b32f8e9b47\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-10T02:29:58Z",
          "tree_id": "365a83b2865540b221eba17e34a4d4b7c26c661e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/772259aa081e102ff0b4b57f68019c275afbb93b"
        },
        "date": 1744254200566,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10344,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26306962795377864,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143875,
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
          "distinct": false,
          "id": "9eadf18b6e9757a16d1bd2d464c5a539256b7a7d",
          "message": "chore(avm): check full tuple after find_in_dst (#13397)\n\nCloses #13140, assuming tests are compiled with assertions enabled.",
          "timestamp": "2025-04-10T07:07:22Z",
          "tree_id": "95ffdd0d048c89685edd60dc8b40222074c2408f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9eadf18b6e9757a16d1bd2d464c5a539256b7a7d"
        },
        "date": 1744273585013,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10341,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2629781007616372,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153535,
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
          "id": "ac97b246604b9df6e7691c559a01d395a045050d",
          "message": "feat: Add nullifier read gadget (#13403)\n\nAdds a nullifier read gadget that will eventually be transformed to a\nnullifier rw gadget",
          "timestamp": "2025-04-10T07:39:09Z",
          "tree_id": "5a563efefcb94a579155358e0b3ac4bab89c048d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac97b246604b9df6e7691c559a01d395a045050d"
        },
        "date": 1744275532606,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10717,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.272558138013629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157467,
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
          "distinct": false,
          "id": "220e82b278055d254de689e7cab343f51290a956",
          "message": "fix: omit p2p options from prover & bootstrap nodes (#13441)\n\nWe were getting options like `p2pPort` in multiple namespaces & getting\nthem overwriten. we should only get p2p CLI options under the `p2p.`\nnamespace and apply those to whatever infra is starting",
          "timestamp": "2025-04-10T12:40:43Z",
          "tree_id": "f4d5d9c62d04756ccd317b5307db0e1f52023756",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/220e82b278055d254de689e7cab343f51290a956"
        },
        "date": 1744292377226,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10359,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26344331477023925,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150878,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "915841b28fcba381467b2bb55e082fd91fb22d27",
          "message": "fix: deprecate witness circuit size from ECCVM and Translator (#13133)\n\nThe circuit sizes in Translator and ECCVM are now given by constexpr\nintegers. Therefore, the provers do not need to send the circuit sizes\nto the verifiers. In its turn, the respective recursive verifiers do not\nneed to constrain witness `log_circuit_size`s in-circuit.\n\nTo support this change, I modified Shplemini interface to accept log\ncircuit size as an integer as opposed to (unconstrained) witness\n`circuit_size`. The derivation of log circuit sizes in other Flavors'\nrecursive verifiers is still insecure.\n\nIntroduced `USE_PADDING` flag in Flavors to allow compile time exclusion\nof padding logic in Shplemini and Sumcheck.\n \n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1040",
          "timestamp": "2025-04-10T15:37:21Z",
          "tree_id": "5850f444477e53e31be896d552284a1c5f3bdad9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/915841b28fcba381467b2bb55e082fd91fb22d27"
        },
        "date": 1744307664167,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10348,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2631738236788016,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143802,
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
          "distinct": false,
          "id": "148ff8d9011739dd03a7865ca46cb5f5301ca4e7",
          "message": "chore: update koa dependency (#13452)\n\n## Overview\n\nupdate koa dependency",
          "timestamp": "2025-04-10T17:53:50Z",
          "tree_id": "e4abc6761a4f3ce5c3f7df6836c258050780b237",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/148ff8d9011739dd03a7865ca46cb5f5301ca4e7"
        },
        "date": 1744311347338,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10340,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2629599136018908,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145008,
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
          "id": "507b68be913746f6d1e05172010e5f4d03ee8bf5",
          "message": "feat: statically defined ECCVM/Translator VK data (#13395)\n\nIntroduces static methods for initializing the verification keys for\nECCVM/Translator. This is possible since the VK commitments for these\nVMs are a function only of the respective fixed circuit size constants.\nThe ECCVM/Translator VKs are now default constructed with the correct\nvalues which allows removal of a lot of explicit handling of them\nelsewhere.\n\nNote: there's more simplification that could come out of this work but\nits beyond the scope of the primary purpose of this PR which was to\nintroduce simple methods for obtaining the fixed VK data.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/798",
          "timestamp": "2025-04-10T18:58:02Z",
          "tree_id": "4ef5e63ea0f63227dbb151e1afdff17ee318d18f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507b68be913746f6d1e05172010e5f4d03ee8bf5"
        },
        "date": 1744316319469,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10564,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2686594751898348,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144616,
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
          "distinct": false,
          "id": "40b34ef0fed0e3044a0485a55c4c0c3917c51d46",
          "message": "chore: remove lingering log (#13408)\n\nFixes #13355\n\nThe `bridgeL1FeeJuice` function already does logging based on whether it\nmints or not, so not needed directly in the cli part as well.",
          "timestamp": "2025-04-10T20:39:27Z",
          "tree_id": "030ab94bdf249888befb79860cdac314f5943d2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40b34ef0fed0e3044a0485a55c4c0c3917c51d46"
        },
        "date": 1744321426673,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26431336146332335,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150898,
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
          "id": "a045f7852fa17320666daa65b658601559585bb7",
          "message": "chore(dep): bump crypto polyfill (#13466)\n\ntitle",
          "timestamp": "2025-04-10T22:01:02Z",
          "tree_id": "fb6c55075aef14cbfffc53184b99288810e03db8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a045f7852fa17320666daa65b658601559585bb7"
        },
        "date": 1744325918122,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10322,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26249199399418316,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144913,
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
          "id": "29d737e7811be26586577061c0b409a3da9f2dcb",
          "message": "feat: Reorg cheat codes (#13367)\n\nLeverages [`anvil_reorg` and\n`anvil_rollback`](https://github.com/foundry-rs/foundry/discussions/10267)\nto simulate reorgs in EthCheatCodes.\n\nRequires foundry `nightly-fe92e7ef225c6380e657e49452ce931871ae56bc`\n(2025-01-31T00:20:44.300723007Z) or later.",
          "timestamp": "2025-04-10T23:04:17Z",
          "tree_id": "8b96731538e53f3333947fd6ad6b1bf2e6f55099",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29d737e7811be26586577061c0b409a3da9f2dcb"
        },
        "date": 1744329867718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26540595300244463,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154804,
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
          "id": "95b199e9353b4666687ae3e1907d289c4ef60e05",
          "message": "fix: PXE sync batch and plantext deploy sent tx (#13476)\n\nFixes extracted from playground branch",
          "timestamp": "2025-04-11T06:04:24Z",
          "tree_id": "0fda1a3a240e03a3b16437539ff311d3b2061b7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95b199e9353b4666687ae3e1907d289c4ef60e05"
        },
        "date": 1744354866646,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10137,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25779168936307667,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146254,
            "unit": "us"
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
          "distinct": false,
          "id": "391bc72767bd722ee5cdf3b61100bd3ce15199f6",
          "message": "fix: suppress mock call warnings (#13443)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-11T09:22:53Z",
          "tree_id": "c10373533290fef72f8a1006d69ff2e199b0e155",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/391bc72767bd722ee5cdf3b61100bd3ce15199f6"
        },
        "date": 1744368057798,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26283509174390296,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158949,
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
          "distinct": false,
          "id": "e9922dc3feec3396f2d6611dac625af6e7871f63",
          "message": "feat: dsl layer for recursive avm verifier v2 (#13362)\n\nThis PR creates the DSL layer for the goblinized avm recursive verifier\nversion 2.\nThe core logic lies in avm2_recursion_constraint.cpp and the goblinized\nv2 verifier is activated in routine process_avm_recursion_constraints()\nof acir_format.cpp.\n\nAs a consequence of enabling this verifier in the DSL layer, the AVM\nintegration tests are hooked with this version. The AVM integration test\nwas upgraded as it now integrates a clientIvc proof as well.\nIn addition, the new avm recursive verifier was added in the\nrollup_ivc_integration test.\n\nDuring this work, we hit an issue related to ipa claim/proof which is\nnot yet properly handled in the DSL layer which required us to\ntemporarily remove them from the goblinized avm recursive verifier. This\nunfortunately led to the unit test AvmRecursiveTests.GoblinRecursion\nbeing temporarily disabled.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: sirasistant <sirasistant@gmail.com>",
          "timestamp": "2025-04-11T09:34:12Z",
          "tree_id": "f6f83a48cf4599aebab42a1d0118430b308ee161",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e9922dc3feec3396f2d6611dac625af6e7871f63"
        },
        "date": 1744368924221,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10566,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2686975183365904,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153363,
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
          "id": "cf18f8e674406ca0a50674cf200b58be0cbf4856",
          "message": "chore: Bump Noir reference (#13478)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add benchmark for ACVM arithmetic solver\n(https://github.com/noir-lang/noir/pull/8003)\nfeat: attribute locations (https://github.com/noir-lang/noir/pull/8006)\nfix(LSP): implement missing members associated constants\n(https://github.com/noir-lang/noir/pull/8016)\nchore: bump a few versions in yarn.lock\n(https://github.com/noir-lang/noir/pull/8014)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8015)\nchore(deps): bump koa from 2.14.2 to 2.16.1\n(https://github.com/noir-lang/noir/pull/8013)\nchore: improve checking of github urls in `noir_wasm`\n(https://github.com/noir-lang/noir/pull/8012)\nfix(parser): error on missing function body\n(https://github.com/noir-lang/noir/pull/8001)\nfix: better tests to check for unused struct error\n(https://github.com/noir-lang/noir/pull/8007)\nfix: checks for index out of bounds also for arrays\n(https://github.com/noir-lang/noir/pull/7827)\nfeat(stdlib): Expose the times a mock oracle is called\n(https://github.com/noir-lang/noir/pull/7996)\nfeat: add `loop` generator to AST fuzzer\n(https://github.com/noir-lang/noir/pull/7985)\nfeat: allow splicing a resolved function into an attribute name\n(https://github.com/noir-lang/noir/pull/7956)\nchore: bump `crossbeam-channel` to `v0.5.15`\n(https://github.com/noir-lang/noir/pull/8005)\nchore: add `teddav/tdd.nr` to external repo checks\n(https://github.com/noir-lang/noir/pull/7994)\nchore: clippy fixes (https://github.com/noir-lang/noir/pull/8002)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-11T09:51:33Z",
          "tree_id": "f20afbf6148f9ac475df7e674e06cece9129f426",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf18f8e674406ca0a50674cf200b58be0cbf4856"
        },
        "date": 1744369962917,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9324,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2516572257458428,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133775,
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
          "distinct": false,
          "id": "73d6cf73d0ed63f25c86521cb3efb5afac53a385",
          "message": "feat: Evolve nullifier read gadget into a read/write gadget (#13440)\n\n- Implement a write sidecar in the nullifier read gadget\n - Use it in tx level to insert the nonrevertible nullifiers\n - Use nullifier read to prove membership of the deployment nullifier",
          "timestamp": "2025-04-11T13:25:40Z",
          "tree_id": "b36e4297a709f5290a213c8a7e0e078356a555ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73d6cf73d0ed63f25c86521cb3efb5afac53a385"
        },
        "date": 1744381529756,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9623,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.259717930744136,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149678,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "39f4ec0c9d0bba6fdde61509ed85c67d099f4310",
          "message": "feat: compute padding indicator array in-circuit (#13417)\n\nPreparation step for removing insecure `dummy_round` bools in Sumcheck\nand Shplemini.\n\nFor full description, see the docs in `padding_indicator_array.hpp`",
          "timestamp": "2025-04-11T15:39:11Z",
          "tree_id": "6cee09ed45ea8a3011900043495a51a1ec0a4c82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39f4ec0c9d0bba6fdde61509ed85c67d099f4310"
        },
        "date": 1744392585078,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9864,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2662340895180178,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159672,
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
          "id": "ebe68db5966269f6e4849cadb3aaee051faed942",
          "message": "chore(avm): nuke vm1 (#13484)\n\nWe have pinned the commit to be able to refer back to the useful files.\nRemoving the code and BB dependency should speed up compilation.",
          "timestamp": "2025-04-11T16:37:21Z",
          "tree_id": "fce7a914c87cb64aa3f2dd4ae2c7ec08ebe8cc9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebe68db5966269f6e4849cadb3aaee051faed942"
        },
        "date": 1744392830952,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9570,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25830075299835514,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144557,
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
          "distinct": false,
          "id": "b49184f21cc3e9fa25af4b2df4d5765ac9865113",
          "message": "fix: Block stream fails when pruning to a block before its start (#13473)\n\nFixes #13471\n\nI moved the `L2MemoryTipsStore` from kv-store to stdlib to be able to\ntest this. Since I was at it, I also deleted the old L2BlockDownloader\n(no longer in use). Most of the changes in this PR are related to moving\nthings around.",
          "timestamp": "2025-04-11T18:16:58Z",
          "tree_id": "18a4f716eee3b8355608070ab0bf069fcb492a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b49184f21cc3e9fa25af4b2df4d5765ac9865113"
        },
        "date": 1744399265094,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9508,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2566158122557659,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142297,
            "unit": "us"
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
          "distinct": false,
          "id": "c580e8baa1df6afe129115cb12f82d2bdf4783e9",
          "message": "feat: fast PXE sync (#13475)\n\nThis makes PXE's syncing process much faster as it will skip downloading\nmost blocks from the node and jump all the way to the last finalized\none. PXE not having these blocks is not an issue since they aren't used\nfor anything other than to detect reorgs, for which having the last\nfinalized one is sufficient.\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-04-11T20:06:04Z",
          "tree_id": "9abd5106045152d6a97035ae46c67d9e4045260a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c580e8baa1df6afe129115cb12f82d2bdf4783e9"
        },
        "date": 1744405498664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9917,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26765284248656984,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150227,
            "unit": "us"
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
          "id": "927e80d8e69672b3ebd44414dcea502c4aac0151",
          "message": "feat: support HonkRecursionConstraints in ClientIVC (#13401)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1243.\n\nThis PR enables HRCs while building Mega circuits, which means they can\nbe part of app circuits during CIVC.\n\nThe pairing point object functionality that comes with HRCs is not\nsupported yet though, and that is definitely required for secure usage.",
          "timestamp": "2025-04-11T19:51:59Z",
          "tree_id": "a22c01744c4a29c569024175a86068f81a0bc5b6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/927e80d8e69672b3ebd44414dcea502c4aac0151"
        },
        "date": 1744405690029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9635,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2600496174670127,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145667,
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
          "distinct": false,
          "id": "29302c497fd29e53c20847d83ab2469435742959",
          "message": "chore: Try fix flake in reorg tests (#13498)\n\n- Ensures no caching is used for block numbers\n- Less strict assertions on block numbers",
          "timestamp": "2025-04-11T20:37:06Z",
          "tree_id": "05a5b2aca30e3a22f79f5bd536e38689afd07d9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29302c497fd29e53c20847d83ab2469435742959"
        },
        "date": 1744407256017,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9556,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25791675478822457,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135950,
            "unit": "us"
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
          "id": "09a2b2e46aeb9464cf07c1d13fe2acce740c234d",
          "message": "feat!: rename encrypted_logs to messages (#13496)\n\nFurther renaming and moving incoming, but this is the largest piece as\nit affects all files, so having this as a separate part of the changeset\nwill avoid very messy PR diffs.\n\nedit: ended up making a much larger changeset, since it's all renamings.\nSummary:\n\n```\n- `encrypted_logs` to `messages`: this module now handles much more than just encrypted logs (including unconstrained message delivery, message encoding, etc.)\n- `log_assembly_strategies` to `logs`\n- `discovery` moved to `messages`: given that what is discovered are messages\n- `default_aes128` removed\n```\n\nWhich means there's no longer an `encrypted_logs` directory in\n`aztec-nr` (which I always found odd) and we instead have `messages`,\nwith the following content:\n\n```\n$ tree messages/\nmessages/\n├── discovery\n│   ├── mod.nr\n│   ├── nonce_discovery.nr\n│   ├── partial_notes.nr\n│   ├── pending_tagged_log.nr\n│   ├── private_logs.nr\n│   └── private_notes.nr\n├── encoding.nr\n├── encryption\n│   ├── aes128.nr\n│   ├── log_encryption.nr\n│   ├── mod.nr\n│   └── poseidon2.nr\n├── logs\n│   ├── arithmetic_generics_utils.nr\n│   ├── event.nr\n│   ├── mod.nr\n│   ├── note.nr\n│   └── utils.nr\n├── mod.nr\n└── msg_type.nr\n```\n\nwhich seems fairly reasonable: discovery is about discovering messages,\nencoding is of messages, encryption is arguably not strictly just\nmessages but it _is_ the only usage we have for it, and logs is about\nhow to put a message in a log.",
          "timestamp": "2025-04-11T21:08:44Z",
          "tree_id": "7a8b7ff9ba0232bef436e34ecbd273b76c98f703",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a2b2e46aeb9464cf07c1d13fe2acce740c234d"
        },
        "date": 1744409358109,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9737,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26280034794766066,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146179,
            "unit": "us"
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
          "id": "b855fcd2e3f7cd8eeac984de2b167dbc34254173",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e90f27d7b2\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e90f27d7b2\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-12T02:29:02Z",
          "tree_id": "8b4bbfe86141d13323e4ee7991a16efac49b7e73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b855fcd2e3f7cd8eeac984de2b167dbc34254173"
        },
        "date": 1744426876269,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9448,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2549869714406942,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146278,
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
          "id": "b184863da69d6512bc4455d3c4ce7f9cd2c85aec",
          "message": "chore: Bump Noir reference (#13505)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: parse IfElse in SSA parser\n(https://github.com/noir-lang/noir/pull/8043)\nfeat: `ssa::create_program_with_passes`\n(https://github.com/noir-lang/noir/pull/8035)\nchore: don't use `set_value_from_id` in\n`remove_truncate_after_range_checks`\n(https://github.com/noir-lang/noir/pull/8037)\nfix(ssa): Remove OOB checks inserted during DIE\n(https://github.com/noir-lang/noir/pull/7995)\nfix(fuzz): remove duplicate gen_loop, move unconstrained generators up\n(https://github.com/noir-lang/noir/pull/8029)\nchore: remove unnecessary double compilation\n(https://github.com/noir-lang/noir/pull/8031)\nfix(ssa): Map terminator instructions after constant folding\n(https://github.com/noir-lang/noir/pull/8019)\nfix: use proper max bit size during truncation\n(https://github.com/noir-lang/noir/pull/8010)\nfix(docs): fix proof splitting script in solidity guide\n(https://github.com/noir-lang/noir/pull/8033)\nchore: add workflow to run nightly tests on ARM64\n(https://github.com/noir-lang/noir/pull/8027)\nchore: correct name of acvm benchmark\n(https://github.com/noir-lang/noir/pull/8032)\nchore: fix failing test on MacOS\n(https://github.com/noir-lang/noir/pull/8030)\nfeat: add `while` generator to AST fuzzer\n(https://github.com/noir-lang/noir/pull/8021)\nchore: clippy fixes (https://github.com/noir-lang/noir/pull/8020)\nfeat(fuzz): Generate arbitrary `Call` in function body\n(https://github.com/noir-lang/noir/pull/7987)\nchore: use insta snapshots for ssa tests\n(https://github.com/noir-lang/noir/pull/7989)\nchore: add snapshot tests for the build artifacts as produced by\ntest_programs (https://github.com/noir-lang/noir/pull/7986)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-14T09:33:42Z",
          "tree_id": "8b1964ee61275182b24ab57a3cda29e25c5077d8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b184863da69d6512bc4455d3c4ce7f9cd2c85aec"
        },
        "date": 1744626766617,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9663,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2595764905725712,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154901,
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
          "id": "e3a337b4ab6792b1aafe0001d92f0aac89c4b92c",
          "message": "chore(txe): no custom public merkle db (#13508)\n\nThe TXE does not need a custom db because it already gets the net public\ndata writes from the public \"outputs\" of the simulation.",
          "timestamp": "2025-04-14T10:30:28Z",
          "tree_id": "ca5cc2faef24b5165862a0a7243da2a56e175820",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3a337b4ab6792b1aafe0001d92f0aac89c4b92c"
        },
        "date": 1744629757557,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9862,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2649158905293364,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150333,
            "unit": "us"
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
          "distinct": false,
          "id": "e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c",
          "message": "feat!: remove PXE starting block (#13504)\n\nAs of https://github.com/AztecProtocol/aztec-packages/pull/13475, PXE no\nlonger needs to use the `startingBlock` option, and hence we can also\nremove the environment variable used to configure it. The effects of\npassing no value are equivalent to a value of 1, which was the default\nif the envvar was unset.",
          "timestamp": "2025-04-14T11:28:14Z",
          "tree_id": "47902f8d544767fcaf01fbf0e9cbafa201a5aa74",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c"
        },
        "date": 1744634270729,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10077,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2707005378007584,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 175551,
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
          "distinct": false,
          "id": "b29b358641a1d6f71d2dd0746b095526948532cd",
          "message": "chore: add helper script for gov (#13385)\n\nAdding some scripts for setting things up and dealing with some\ngovernance testing.",
          "timestamp": "2025-04-14T13:02:51Z",
          "tree_id": "c2f6dc81e214a51cbe9c64d67e0a6ce19af1bda3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b29b358641a1d6f71d2dd0746b095526948532cd"
        },
        "date": 1744639013217,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9915,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2663422972609092,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155704,
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
          "distinct": false,
          "id": "89462d542f15f8f384b201338ff2c3e90d8ddba6",
          "message": "chore: Less strict block proposal init deadline (#13522)\n\nInstead of using a fixed deadline of 3s for the start of building a\nblock, we derive it from the total aztec slot time, assuming we will\nallocate at least 1s to tx processing.\n\nFixes #13511",
          "timestamp": "2025-04-14T13:19:06Z",
          "tree_id": "f6a368efaef9ef69a9a591216eb69ca30e0c46b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/89462d542f15f8f384b201338ff2c3e90d8ddba6"
        },
        "date": 1744639924698,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9476,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2545615520923305,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137003,
            "unit": "us"
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
          "distinct": false,
          "id": "afd35789e6995647ea8fd9c9f6690a7bcbc69842",
          "message": "chore: fix mistery irreproducible bug (#13494)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10558.\n\nI didn't really fix anything, I just removed the 'fix' and couldn't\nreproduce.",
          "timestamp": "2025-04-14T13:28:42Z",
          "tree_id": "784619db0d0304595aac085ca1008e106e9f2068",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/afd35789e6995647ea8fd9c9f6690a7bcbc69842"
        },
        "date": 1744641366230,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9575,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2572132894904708,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147924,
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
          "distinct": false,
          "id": "1b97cd2055e6b77974eea43ba66503b875d42f14",
          "message": "feat: Validator waits for archiver sync (#13497)\n\nSlow validators may receive a proposal to attest to before their\narchiver has synced to the block immediately before. Example log:\n\n```\n[18:02:27.581] ERROR: validator Failed to attest to proposal: Error: Unable to sync to block number 4811 (last synced is 4810)\n    at ServerWorldStateSynchronizer.syncImmediate (file:///usr/src/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:145:19)\n    at async Sequencer.buildBlock (file:///usr/src/yarn-project/sequencer-client/dest/sequencer/sequencer.js:351:9)\n    at async ValidatorClient.reExecuteTransactions (file:///usr/src/yarn-project/validator-client/dest/validator.js:161:41)\n    at async ValidatorClient.attestToProposal (file:///usr/src/yarn-project/validator-client/dest/validator.js:127:17)\n    at async LibP2PService.processValidBlockProposal (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:451:29)\n    at async LibP2PService.processBlockFromPeer (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:441:9)\n    at async LibP2PService.handleNewGossipMessage (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:355:13)\n    at async safeJob (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:285:17) {\"slotNumber\":7976,\"blockNumber\":4812,\"archive\":\"0x1f26b22cdad7132d0bb06461300a27b12fde92b633633550e37764d810304cb4\",\"txCount\":0,\"txHashes\":[]}\n[18:02:29.560] INFO: archiver Downloaded L2 block 4811 {\"blockHash\":{},\"blockNumber\":4811,\"txCount\":0,\"globalVariables\":{\"chainId\":11155111,\"version\":3538330213,\"blockNumber\":4811,\"slotNumber\":7975,\"timestamp\":1744394520,\"coinbase\":\"0x2b64d6efab183a85f0b37e02b1975cd9f2d98068\",\"feeRecipient\":\"0x0000000000000000000000000000000000000000000000000000000000000000\",\"feePerDaGas\":0,\"feePerL2Gas\":0}}\n```\n\nThis PR has the validator keep retrying to sync to the target block\nuntil the reexecution deadline, rather than giving up immediately.",
          "timestamp": "2025-04-14T17:16:26Z",
          "tree_id": "51d2532f94267dcda9e5aad10e8fff867c4f68b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1b97cd2055e6b77974eea43ba66503b875d42f14"
        },
        "date": 1744655595895,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9517,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2556619535385532,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145980,
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
          "id": "f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47",
          "message": "chore: use heap buffer methods for civc proof in bbjs (#13541)\n\nAdd \"heap buffer\" serialization for CIVC Proof type and use in bbjs\nmethods",
          "timestamp": "2025-04-14T22:07:25Z",
          "tree_id": "8dd4fb88b6d5b3b427ef618506a650fd6dff2a22",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47"
        },
        "date": 1744672902027,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9655,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2593500221614594,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158299,
            "unit": "us"
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
          "id": "5e8b0922bd5375cb038bb85bbf7751c48ae32aa6",
          "message": "feat: more tests for pairing point object (#13500)\n\nAdds integration tests to test that CIVC pass with\nHonkRecursionConstraints, and that tampering with the VK doesn't cause\nthings to fail (yet).",
          "timestamp": "2025-04-15T00:29:36Z",
          "tree_id": "7810c86a2da7a939065e619e524188eec8395af8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e8b0922bd5375cb038bb85bbf7751c48ae32aa6"
        },
        "date": 1744681660501,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9650,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2592176500261032,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143036,
            "unit": "us"
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
          "id": "9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5",
          "message": "chore: bench ivc in native/wasm with memory/time (#13186)\n\nAdds ability to just call the main.cpp flow in wasm, allowing us to\neasily port our current benchmark to wasm, and measures time + memory\n\n- support compiling bb cli (main.cpp logic) in WASM, shim the no\nexceptions support accordingly. Note this is ONLY FOR wasmtime dev\ntesting. It does not get us browser support because the WASI file system\nAPI is not defined there.\n- add an experimental no exceptions build for native, to be benchmarked\n- support benching both wasm and native and capture their memory amounts\n- support a NATIVE_PRESET env var that controls bootstrap and benchmarks\nto opt into op count time metrics\n- more condensed printing of ivc trace amounts, just printing the\nmaximums and printing multiple counts on one line\n- Tricky change: Fix a static initialization bug when compiling plookup\ntables in wasm. a function static was used\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1244\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
          "timestamp": "2025-04-15T00:31:53Z",
          "tree_id": "c3b92f293fd64bda64ceab543f19cb91a4c33111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5"
        },
        "date": 1744682191086,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9880,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26540412156676546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153097,
            "unit": "us"
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
          "id": "a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358",
          "message": "fix: cpp bench ci (#13565)",
          "timestamp": "2025-04-15T10:10:17-04:00",
          "tree_id": "8d40dee5b283e69d03eb5715cdbc408c7d6be5ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358"
        },
        "date": 1744729052533,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9971,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2678595344601291,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159081,
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
          "distinct": false,
          "id": "a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f",
          "message": "refactor(public/avm): from hints to the end of the world (#13459)\n\nI had a few design goals with this PR\n1. Move the merkle hinting layer to the merkle db directly (from the\nPublicContractsDB)\n1. Make hinting a TxSimulator concept\n1. Divide the tree accesses into low level and high level (like we do in\nC++).\n1. Tighten our exports\n1. Some cleanups\n\nI'm satisfied with the result, but there are some things worth noting\n* Now the TxSimulator wraps the merkle db into a hinting merkle db. This\nmeans that the hints will _always_ be generated and the caller has no\ncontrol. However, reexecution and the TXE could benefit from a model\nwhere no hinting (or tracing) is done. I had a version of this PR where\nthis was done via an extra PublicTreesDBFactory that was passed to the\nTxSimulator, but I found it too much for the moment. I think at some\npoint we can consider having a more flexible factory type for the\nPublicProcessor and the TxSimulator where we can specify, e.g., merkle\nops, tracing, hinting, etc and have a \"Proving\" factory and a\n\"Simulation-only\" factory.\n\n## AI generated description\n\nThis PR refactors the public processor and simulator components to use\n`MerkleTreeWriteOperations` directly instead of going through the\n`PublicTreesDB` abstraction. Key changes include:\n\n- Changed `PublicTxSimulator` to accept a `MerkleTreeWriteOperations`\ninstead of `PublicTreesDB`\n- Moved `PublicTreesDB` to be an internal implementation detail rather\nthan a public API\n- Refactored `HintingPublicTreesDB` to `HintingMerkleWriteOperations` to\nwork directly with the merkle tree interface\n- Moved `SimpleContractDataSource` from `avm/fixtures` to\n`public/fixtures` for better organization\n- Added high-level methods to `PublicTreesDB` for writing note hashes\nand nullifiers\n- Simplified tree operations in `PublicPersistableStateManager` by using\nthe new high-level methods\n- Updated `checkL1ToL2MessageExists` to no longer require a contract\naddress parameter\n\nThis change simplifies the codebase by reducing unnecessary abstractions\nand making the component dependencies more explicit.",
          "timestamp": "2025-04-15T14:59:39Z",
          "tree_id": "859d0be15b138c9bbe6d544b98552e8443fb7953",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f"
        },
        "date": 1744732456970,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9997,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26862577233267365,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159203,
            "unit": "us"
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
          "distinct": false,
          "id": "ea12d56bbd83b127f27787695d398b40aa2a36f7",
          "message": "fix: make the token use large notes first (#13545)\n\nThis fixes an issue @alexghr has encountered where the AMM bot crashes\ndue to trying to use too many small notes. There's other things to fix\n(make `transfer_to_public` recursive, have better max notes limits,\netc.), but this quick patch will fix most issues (unless someone needs\nto combine more than 15 notes for a transfer), so it's a good stopgap\nmeasure.\n\nThe fix is trivial, but adding tests for it is not, reflecting TXE's\npoor state of affairs. I wanted to test that regardless of the order in\nwhich two notes are created, we always consume the larger one first, but\na) was forced to write two separate tests, since it seems we lack\ncontrol over TXE's execution cache (notably transient nullified notes),\nand b) was forced to use the actual token contract and to call contract\nfunctions due to #13269. Usage of `set_contract_address` is also quite\nobscure.\n\nEach test could e.g. have looked like this, which is much simpler and\nhas way fewer moving pieces:\n\n```noir\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    recipient_balance_set.add(owner, small_note_amount);\n    recipient_balance_set.add(owner, large_note_amount);\n});\n\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    let emission = recipient_balance_set.sub(owner, small_note_amount);\n    assert_eq(emission.emission.unwrap().note.value, large_mint_amount - small_mint_amount);\n});\n```\n\nI guess we'd need to explicitly deal with note discovery via oracle\nhints in that case, but regardless it seems solvable. It'd also let us\ntest that this works for both transient and settled notes, or even a mix\n(which is something we should have extensive coverage of in the almost\nnon-existent note getter options tests).",
          "timestamp": "2025-04-15T15:05:29Z",
          "tree_id": "eb29cd8ce9439d0246d24970dd5d08cd63ff0ea0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea12d56bbd83b127f27787695d398b40aa2a36f7"
        },
        "date": 1744732923624,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9631,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25878517440438653,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155851,
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
          "distinct": false,
          "id": "6b938322017ba4fa0baaf35be09c1c28b80e2dba",
          "message": "fix: amm bot (#13553)\n\nFix #13544",
          "timestamp": "2025-04-15T15:24:13Z",
          "tree_id": "bacb6480e099c6c677477c77d97bd770ae673079",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b938322017ba4fa0baaf35be09c1c28b80e2dba"
        },
        "date": 1744733943064,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9789,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2630146901594895,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151896,
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
          "distinct": false,
          "id": "42dfbbf6e11b63727add72987edbbea08fb21e64",
          "message": "chore(noir-contracts): update readme (#13563)\n\nCurrent prose is unacceptable\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-15T15:25:00Z",
          "tree_id": "78e1c92de1f31112390c265aa97c947583cb9fdb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42dfbbf6e11b63727add72987edbbea08fb21e64"
        },
        "date": 1744734280580,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9874,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2653170166905629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153503,
            "unit": "us"
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
          "id": "9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a",
          "message": "fix: wasm memory benchmark (#13573)",
          "timestamp": "2025-04-15T15:44:23Z",
          "tree_id": "e7374c7f21712a84f3e75eb9daef62489303baa7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a"
        },
        "date": 1744736658746,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9538,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25627784618972504,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145101,
            "unit": "us"
          }
        ]
      }
    ]
  }
}