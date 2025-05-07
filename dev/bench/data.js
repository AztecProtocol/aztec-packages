window.BENCHMARK_DATA = {
  "lastUpdate": 1746645672957,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1746127180134,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17751,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48550,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1856,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29576,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1046,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59544,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42526,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1762,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24039,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1325,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67597,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1803,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746131445827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17028,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48937,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80212,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 983,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47573,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21379,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1047,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58458,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13352,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1733,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24011,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1326,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2118,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746131795756,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17726.315055000214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13805.668909 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2229378007,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198883633,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20181.968433000293,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17307.210335 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56136.753844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56136756000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4466.802900999937,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3851.4855519999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12262.179157000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12262183000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746131808498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 992,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49643,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 81014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2125,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 979,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48460,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1738,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21127,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13354,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 961,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 23994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1323,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 67507,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2106,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746138718883,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17589.455023000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14081.82486 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2269599736,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201494984,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20278.548829999636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17180.521401 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56085.539339999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56085541000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4434.021915000358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3834.9913049999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12091.564593000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12091567000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746138731637,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 996,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53070,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1732,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16969,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80581,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2129,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48478,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1745,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 20959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1827,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 963,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42049,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1796,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1328,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66863,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2105,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47968,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746139891005,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17738.39465600031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13901.403374 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2235761214,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199743252,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20390.09600700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17177.383554 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56213.280393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56213282000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4380.492620000041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3780.266421 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12189.130462999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12189135000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746139905177,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 17810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 51647,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1747,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 17038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 994,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48720,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1371,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2168,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16220,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47177,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58587,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1913,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13289,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41416,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24122,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66451,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 977,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46812,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1747,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746155366570,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 18012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1001,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 52022,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 16931,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 48193,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1858,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 29833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 80143,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2221,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 16223,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 984,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47602,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1831,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 21155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1909,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13190,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 964,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41226,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 24084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 66555,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2159,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15594,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 46822,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1883,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746186488071,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2932,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26689,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3973,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4680,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14877,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48947,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1434,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60284,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3400,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42500,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2049,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3026,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 68744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3811,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14636,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1187,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48079,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746188080092,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16441,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1293,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53412,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2868,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2754,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26506,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3914,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 84787,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1201,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2509,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12909,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2031,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3021,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3787,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14525,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2355,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746197143284,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17672.144008000032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13871.097801 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2257337135,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200110947,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20276.408475000153,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17348.936938000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56379.51072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56379513000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4451.889780000329,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3771.190265 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12168.494414,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12168498000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746197155816,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16412,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1311,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53442,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2636,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1262,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3879,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4700,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2355,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1407,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1117,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41943,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1942,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2805,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69081,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 4014,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14351,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47616,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2362,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746197948771,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17615.862299999662,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14262.775683000002 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2258748670,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201203176,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20381.023281000125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17296.007627 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56742.380191000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56742382000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4471.131203999903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3905.07638 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12187.217036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12187221000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746197962842,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1301,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2848,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15221,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 49994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3663,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 84607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4474,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1180,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2394,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1389,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60013,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3406,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12976,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1124,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21640,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3811,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14502,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2444,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746218749321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17764.310208000097,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13891.540042 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2185620657,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196277186,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20090.099253000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17041.65224 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55581.033141,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55581035000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4330.305910999414,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3699.1051860000007 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11834.871111,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11834875000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746218762121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16225,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 53702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15209,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1275,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50308,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3888,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 83924,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4620,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14777,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48358,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2270,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1405,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3437,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1113,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21416,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2982,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69262,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3708,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47564,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746225947206,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18102.08568600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14356.042738 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2228876035,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202908952,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20013.39327400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17021.277135999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55131.856397,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55131858000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4323.258240999621,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3676.7526629999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11601.403831000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11601410000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746225961881,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16749,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2711,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1312,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 51503,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2859,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26657,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 4011,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4483,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15071,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1182,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49263,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2475,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 61240,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3157,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12942,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1149,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21948,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3726,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1223,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47548,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2478,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746241541864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16628,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1315,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54522,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15485,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1304,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 50292,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26779,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3897,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85706,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4649,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49340,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2454,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18933,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1423,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 61512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3468,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21876,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 3004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3748,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14639,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1187,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2344,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746327136131,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof",
            "value": 16702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_ecdsar1+sponsored_fpc-ivc-proof-memory",
            "value": 1283,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm",
            "value": 54168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_ecdsar1+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof",
            "value": 15524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-deploy_schnorr+sponsored_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm",
            "value": 51115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmdeploy_schnorr+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 26850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3853,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 85410,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4713,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14988,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1206,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18966,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1386,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3316,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12928,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1151,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1924,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2930,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70332,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14498,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2490,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746430202771,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77656,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4569,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21510,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67429,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3148,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49690,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1417,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58778,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12737,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1127,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41467,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21714,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1751,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3564,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14762,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2213,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13930,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1167,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2149,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746434595854,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24913,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79461,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4721,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21483,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3034,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1214,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2385,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3346,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12958,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1132,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 2094,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70213,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3667,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1237,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48361,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13873,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45283,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746435173150,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18067.10745999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14289.606154 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2179127707,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200619638,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20006.57119199991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17103.867075000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55218.242189,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55218243000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4287.784651000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3591.787118 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11773.885658000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11773893000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746435186172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 4139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78924,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4547,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3052,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49293,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2340,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18466,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1440,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58779,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1130,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40997,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1929,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21940,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3658,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14637,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1226,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2388,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13687,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45056,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2406,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746464287795,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3458,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4456,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3130,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14967,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48725,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2296,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18181,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1412,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3213,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12790,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1128,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41879,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21539,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3589,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47278,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2406,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13862,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1170,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746467987107,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18053.79448299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14316.495228 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2178009841,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 194963043,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20190.923188,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16977.379281999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55639.917389999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55639919000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4155.495659000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3583.4432829999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11967.800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11967803000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746473341530,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17981.70723999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14310.506281 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2196616327,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207754196,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20215.604322999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17065.529397 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55043.758077000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55043760000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4319.9724989999595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3697.424781 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11855.746588999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11855751000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2167.88",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746473354993,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 3664,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 4699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2334,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3123,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14972,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49697,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2347,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1429,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59844,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1128,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1851,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1913,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 3774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1209,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48816,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2418,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1177,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2496,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
        "date": 1746491480892,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17946.73474399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14334.413324 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2164936172,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 195756452,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20135.572959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17069.121175 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55262.259739999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55262262000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4357.637403999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3838.231934 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11635.701165999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11635706000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
        "date": 1746491494582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1897,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2305,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14981,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1227,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 50304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1380,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2002,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1155,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21366,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2223,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14424,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48637,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13282,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1873,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "a0d48a5b515813b9d11d85fad0ef15760b4a028a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2483a77bd8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2483a77bd8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-06T02:31:49Z",
          "tree_id": "60f660004a9cca06fff737684a46dd370ddd381c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0d48a5b515813b9d11d85fad0ef15760b4a028a"
        },
        "date": 1746500759676,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24307,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1895,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79085,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21204,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68048,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3143,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14673,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49449,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1417,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58325,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1987,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1795,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21186,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14179,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1210,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1780,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13520,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542545616,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18097.002206999605,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14446.335739999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2263252198,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 227744383,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19904.603185999804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16946.425709 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55464.101043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55464103000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4283.623434999754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3620.719283 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11778.100483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11778104000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542558255,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2330,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21557,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2317,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3038,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 50082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18252,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1922,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12765,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41645,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1763,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21494,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14530,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13615,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "187c5fc4620336105d7341403b04ed619157f9a7",
          "message": "fix: goblin recursive bugs (#13124)\n\n* Pass `translation_evaluations` from ECCVM to Translator verifier\nwithout creating unconstrained witnesses\n* Remove `translation_evaluations` from `GoblinProof`.\n* Replace insecure `pow()` in ECCVM verifier with a squaring loop\n\n* Fix a bug in `dyadic_size()` method in `MegaTraceBlockData`.",
          "timestamp": "2025-05-06T15:44:11Z",
          "tree_id": "db5a14571c68d6f35b4caa143ea73878b4710b7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/187c5fc4620336105d7341403b04ed619157f9a7"
        },
        "date": 1746548689422,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17929.04506700006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14211.737362 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2137687187,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210013738,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19956.508069999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17051.950348 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55084.247389,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55084248000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4413.101988000108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3675.8103859999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11661.793704000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11661801000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "187c5fc4620336105d7341403b04ed619157f9a7",
          "message": "fix: goblin recursive bugs (#13124)\n\n* Pass `translation_evaluations` from ECCVM to Translator verifier\nwithout creating unconstrained witnesses\n* Remove `translation_evaluations` from `GoblinProof`.\n* Replace insecure `pow()` in ECCVM verifier with a squaring loop\n\n* Fix a bug in `dyadic_size()` method in `MegaTraceBlockData`.",
          "timestamp": "2025-05-06T15:44:11Z",
          "tree_id": "db5a14571c68d6f35b4caa143ea73878b4710b7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/187c5fc4620336105d7341403b04ed619157f9a7"
        },
        "date": 1746548703984,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78489,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2372,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3030,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17948,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70179,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2253,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13520,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44589,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "f061a1003c1b36897996ba4e7770a0275e334b81",
          "message": "fix: Set and map keys should be strings (#13993)\n\nThis PR fixes a couple of instances of maps and sets that don't have\nstring keys.",
          "timestamp": "2025-05-06T17:00:05Z",
          "tree_id": "279c80d0ec4d97eb075bfff5c200935384af8e77",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f061a1003c1b36897996ba4e7770a0275e334b81"
        },
        "date": 1746553636051,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24761,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2368,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3112,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49296,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1380,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58608,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1947,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1726,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69996,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2293,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14265,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1784,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45123,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1739,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "5f2097ce85f8aa4e934808a892442af97ed66735",
          "message": "feat: playground updates (#14103)\n\nSyncing from alpha-testnet\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: Joe Andrews <joe@fuuzik.com>",
          "timestamp": "2025-05-06T20:03:14Z",
          "tree_id": "bdc29e2910af35e652055ac278df4426e6139dbf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f2097ce85f8aa4e934808a892442af97ed66735"
        },
        "date": 1746564598745,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24337,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1873,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77662,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2419,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3020,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1922,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1136,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41633,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1209,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13572,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1177,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1795,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": true,
          "id": "a515ae8f76beaa47adb1071606846671b6f1eb22",
          "message": "feat!: Aggregate pairing points (#13972)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1304.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1069.\nCloses https://github.com/AztecProtocol/barretenberg/issues/801.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1309.\nCloses https://github.com/AztecProtocol/barretenberg/issues/950.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1021.\n\n- **Refactor how we aggregate.** Before, we used to pass in the input\npairing point object into functions as an argument, following how plonk\nhad done it. However, this is entirely unnecessary if we just aggregate\nthe output pairing points outside of it. For example, if function A\ncalls a recursive verifier, we will just do the aggregation in function\nA instead of inside the recursive verifier. The ordering of aggregation\ndoes not matter at all - as long as we are using valid recursion\nseparators, we should be fine.\n- **Add [[nodiscard]] attributes and remove [[maybe_unused]]\nattributes** to verify_proof calls to help us check for unused pairing\npoints.\n- **Aggregate properly everywhere.** We used to ignore pairing points in\nmost places, but now we try to aggregate everything properly. I tried to\nbe thorough in my search, but its possible that I missed somewhere.\n\nDue to the refactoring, we also close\nhttps://github.com/AztecProtocol/barretenberg/issues/1380, as we remove\n1 unnecessary aggregate call in almost all situations by avoiding\naggregation with a default object. Because of this, we drop the number\nof Ultra gates of the UltraRecursiveVerifier **from 730689 to 664852, a\ndrop of around 66k or 9%**.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-05-06T22:24:38Z",
          "tree_id": "496a8eb56d8ebf71cbe018981ea0c7db4ecf9114",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a515ae8f76beaa47adb1071606846671b6f1eb22"
        },
        "date": 1746574666677,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17891.089436999664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14296.511039 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4849480558,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201607984,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25324.085436000132,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19974.872058999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69807.942991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69807943000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4242.64736799978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3682.0560460000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11481.310985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11481315000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": true,
          "id": "a515ae8f76beaa47adb1071606846671b6f1eb22",
          "message": "feat!: Aggregate pairing points (#13972)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1304.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1069.\nCloses https://github.com/AztecProtocol/barretenberg/issues/801.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1309.\nCloses https://github.com/AztecProtocol/barretenberg/issues/950.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1021.\n\n- **Refactor how we aggregate.** Before, we used to pass in the input\npairing point object into functions as an argument, following how plonk\nhad done it. However, this is entirely unnecessary if we just aggregate\nthe output pairing points outside of it. For example, if function A\ncalls a recursive verifier, we will just do the aggregation in function\nA instead of inside the recursive verifier. The ordering of aggregation\ndoes not matter at all - as long as we are using valid recursion\nseparators, we should be fine.\n- **Add [[nodiscard]] attributes and remove [[maybe_unused]]\nattributes** to verify_proof calls to help us check for unused pairing\npoints.\n- **Aggregate properly everywhere.** We used to ignore pairing points in\nmost places, but now we try to aggregate everything properly. I tried to\nbe thorough in my search, but its possible that I missed somewhere.\n\nDue to the refactoring, we also close\nhttps://github.com/AztecProtocol/barretenberg/issues/1380, as we remove\n1 unnecessary aggregate call in almost all situations by avoiding\naggregation with a default object. Because of this, we drop the number\nof Ultra gates of the UltraRecursiveVerifier **from 730689 to 664852, a\ndrop of around 66k or 9%**.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-05-06T22:24:38Z",
          "tree_id": "496a8eb56d8ebf71cbe018981ea0c7db4ecf9114",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a515ae8f76beaa47adb1071606846671b6f1eb22"
        },
        "date": 1746574680864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24334,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77672,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14676,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1376,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1958,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12478,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41276,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1656,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21748,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2179,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49287,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13386,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44719,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1852,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "1ff4447bfbe6833b06243117955deccc01ec2955",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"25bc63e443\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"25bc63e443\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-07T02:32:07Z",
          "tree_id": "48a0f2a4a56b72378400e4bbb6bbf338806919df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ff4447bfbe6833b06243117955deccc01ec2955"
        },
        "date": 1746587200631,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1895,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76652,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20770,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3122,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14710,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17820,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12286,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1136,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14238,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1207,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48140,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13347,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1855,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "810053233e7bedacc38892dbdc873e46792f42c3",
          "message": "chore: run setupEpoch separately (#13984)\n\nFollowing the seed snapshots pr #13577 there was a change that mean that\n`getCurrentProposer` can end up running the `setupEpoch` (reducing\nnumber of different flows etc). However, that meant that when we were\nrunning our benchmark test to get some gas numbers, we never end up\nincluding the gas spent to setup the epoch. To address, we are now\nexplicitly calling `setupEpoch` such that we get some neat measurements\nfor it, also making it clear when changes are made that impact the\nsampling.\n\nA nice side effect, is that it more simply allow us to do the proper\namortized cost for sampling as the propose is for 360 tx, but sampling\nis for 11520 (32 * 360). This new setup makes it more simple to see the\ndirect impact from the sampling on tx costs etc.",
          "timestamp": "2025-05-07T07:40:09Z",
          "tree_id": "b00e0fa7fc47b729ef2f7a0c6eba4eb86deabdaa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/810053233e7bedacc38892dbdc873e46792f42c3"
        },
        "date": 1746606092706,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1885,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21090,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68300,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3009,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58294,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1902,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21883,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1205,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13545,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9",
          "message": "feat: initial gas bench gh (#13986)\n\nAdding benchmark reporting for some l1 gas numbers (see\nhttps://aztecprotocol.github.io/aztec-packages/dev/l1-gas-bench/).\n\nCurrently have removed the if, to see it being run on this pr and get it\ngoing.",
          "timestamp": "2025-05-07T08:53:19Z",
          "tree_id": "9d76ddf7975d251b43fb7addf206f9c8ec3d6986",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9"
        },
        "date": 1746609999511,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24325,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1871,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78009,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2373,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21062,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2316,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14614,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1904,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17732,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1969,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12395,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41504,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1673,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72140,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2282,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47316,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13303,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45284,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1802,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611957391,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18033.398406999822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14177.195861 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4771435874,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203253184,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25376.3761109999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19857.422682 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69419.45713299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69419457000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4257.98032000057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3620.3835369999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11520.458199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11520461000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611970414,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77831,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2359,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21039,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68760,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14729,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1846,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58286,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1959,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12374,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1757,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21971,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2226,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14244,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13612,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1867,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "b50e8bab66f4068325871c52924df57db7a7d873",
          "message": "chore: L1 reorg test for loading blocks before L1 syncpoint (#14122)\n\nAdds an L1 reorg scenario test for loading blocks older than last sync\npoint (see `checkForNewBlocksBeforeL1SyncPoint`)",
          "timestamp": "2025-05-07T10:08:16Z",
          "tree_id": "ab577415275e48feda8df2af2dc8d7dd153e31cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b50e8bab66f4068325871c52924df57db7a7d873"
        },
        "date": 1746614987563,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24564,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1908,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78851,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2352,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67940,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3111,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1810,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17984,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1376,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1978,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42154,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1781,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21852,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2250,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14494,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48971,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1765,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13464,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625373287,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17711.103483999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13982.018813 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4839968613,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201878710,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25106.351195000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19603.453154 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69520.943085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69520945000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4221.580207999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3661.6986719999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11397.780598000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11397783000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625389114,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24309,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2351,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3086,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1751,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58377,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1722,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2270,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14289,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "olehmisar@gmail.com",
            "name": "oleh",
            "username": "olehmisar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a901453a5d99969cc29d4d89de5a4decf73f97c",
          "message": "fix: use globalThis instead of self in PXE (#14136)\n\nA simple fix to make `@pxe/client` work in node.js. Not tested. Please\nrun CI. Similar to\nhttps://github.com/AztecProtocol/aztec-packages/pull/10747",
          "timestamp": "2025-05-07T15:30:47Z",
          "tree_id": "b42efec1cb67a5b021cf8304954a0129c1048587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a901453a5d99969cc29d4d89de5a4decf73f97c"
        },
        "date": 1746633851555,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24469,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2424,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66620,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14516,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17908,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1375,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1950,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2247,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14268,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "98a7ec01df19e1d5981cc21a9487a192497849a1",
          "message": "feat: more profiling (#14142)\n\n- Consolidation of our profiling/timing structs in order to surface more\nand more data to the user on \"where is time spent\" when sending TXs.\n- Display of profiling information on both playground and CLI wallet\n- General improvements for cli-wallet startup time and usability, trying\nto remove the mandatory node or pxe requirements for local-only\ncommands.\n- Removed useless fee estimation default param that forced resimulation\non cli-wallet. Heads up! Fee estimation right now is all but disabled in\nboth playground and cli-wallet, but at least we're not wasting time on\nit. Discussed a bit with @iAmMichaelConnor, and will review soon with\nsane defaults",
          "timestamp": "2025-05-07T18:47:12Z",
          "tree_id": "18869b2a4e7a609e3e0009c292439716fd844e11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98a7ec01df19e1d5981cc21a9487a192497849a1"
        },
        "date": 1746645671968,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1899,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2399,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2283,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14825,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1742,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58619,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1960,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12582,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1776,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71381,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14250,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1854,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1815,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      }
    ]
  }
}