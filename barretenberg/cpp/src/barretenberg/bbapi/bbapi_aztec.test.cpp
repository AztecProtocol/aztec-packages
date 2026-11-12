#include "barretenberg/bbapi/bbapi_aztec.hpp"

#include <gtest/gtest.h>
// nlohmann/json has sign-conversion warnings that fail with -Werror in WASM builds
#ifdef __clang__
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#endif
#include <nlohmann/json.hpp>
#ifdef __clang__
#pragma clang diagnostic pop
#endif

using namespace bb;
using json = nlohmann::json;

namespace {

// A MegaApp verification key of a protocol contract's private function.
const char* const VERIFICATION_KEY =
    "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";

// One function of each kind: a private one whose first parameter is the injected context inputs, utility functions
// with and without a return type, a public function and public_dispatch; plus output structs out of path order.
json synthetic_artifact()
{
    json artifact = json::parse(R"json(
{
  "name": "Synthetic",
  "noir_version": "0",
  "transpiled": true,
  "file_map": {},
  "functions": [
    {
      "name": "transfer",
      "custom_attributes": [
        "abi_private"
      ],
      "is_unconstrained": false,
      "abi": {
        "parameters": [
          {
            "name": "inputs",
            "type": {
              "kind": "struct",
              "path": "aztec::context::inputs::private_context_inputs::PrivateContextInputs",
              "fields": [
                {
                  "name": "x",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            },
            "visibility": "private"
          },
          {
            "name": "to",
            "type": {
              "kind": "struct",
              "path": "aztec::protocol_types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            },
            "visibility": "private"
          },
          {
            "name": "amount",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 128
            },
            "visibility": "private"
          }
        ],
        "return_type": null,
        "error_types": {}
      },
      "bytecode": "AQID",
      "debug_symbols": ""
    },
    {
      "name": "balance",
      "custom_attributes": [
        "abi_utility"
      ],
      "is_unconstrained": true,
      "abi": {
        "parameters": [
          {
            "name": "owner",
            "type": {
              "kind": "struct",
              "path": "aztec::protocol_types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            },
            "visibility": "private"
          },
          {
            "name": "tag",
            "type": {
              "kind": "string",
              "length": 3
            },
            "visibility": "private"
          },
          {
            "name": "flags",
            "type": {
              "kind": "array",
              "length": 2,
              "type": {
                "kind": "boolean"
              }
            },
            "visibility": "private"
          },
          {
            "name": "n",
            "type": {
              "kind": "integer",
              "sign": "signed",
              "width": 8
            },
            "visibility": "private"
          }
        ],
        "return_type": {
          "abi_type": {
            "kind": "integer",
            "sign": "unsigned",
            "width": 128
          },
          "visibility": "public"
        },
        "error_types": {}
      },
      "bytecode": "BAUG",
      "debug_symbols": ""
    },
    {
      "name": "noop",
      "custom_attributes": [
        "abi_utility"
      ],
      "is_unconstrained": true,
      "abi": {
        "parameters": [],
        "return_type": null,
        "error_types": {}
      },
      "bytecode": "Bw==",
      "debug_symbols": ""
    },
    {
      "name": "set",
      "custom_attributes": [
        "abi_public"
      ],
      "is_unconstrained": true,
      "abi": {
        "parameters": [
          {
            "name": "value",
            "type": {
              "kind": "field"
            },
            "visibility": "private"
          }
        ],
        "return_type": null,
        "error_types": {}
      },
      "bytecode": "CAk=",
      "debug_symbols": ""
    },
    {
      "name": "public_dispatch",
      "custom_attributes": [
        "abi_public"
      ],
      "is_unconstrained": true,
      "abi": {
        "parameters": [
          {
            "name": "selector",
            "type": {
              "kind": "field"
            },
            "visibility": "private"
          }
        ],
        "return_type": null,
        "error_types": {}
      },
      "bytecode": "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJw==",
      "debug_symbols": ""
    }
  ],
  "outputs": {
    "globals": {},
    "structs": {
      "functions": [
        {
          "kind": "struct",
          "path": "Synthetic::a_abi",
          "fields": []
        },
        {
          "kind": "struct",
          "path": "Synthetic::transfer_abi",
          "fields": [
            {
              "name": "parameters",
              "type": {
                "kind": "struct",
                "path": "Synthetic::transfer_parameters",
                "fields": []
              }
            },
            {
              "name": "return_type",
              "type": {
                "kind": "field"
              }
            }
          ]
        }
      ],
      "events": [
        {
          "kind": "struct",
          "path": "A::E1",
          "fields": []
        },
        {
          "kind": "struct",
          "path": "B::E2",
          "fields": [
            {
              "name": "v",
              "type": {
                "kind": "field"
              }
            }
          ]
        }
      ]
    }
  }
}
)json");
    artifact["functions"][0]["verification_key"] = VERIFICATION_KEY;
    return artifact;
}

} // namespace

// The expected values are what labs' getContractClassFromArtifact derives from the same artifact. The class id is part
// of every deployed contract's address, so these must never move.
TEST(AztecContractClass, MatchesTheReferenceDerivation)
{
    auto klass = bbapi::compute_aztec_contract_class(synthetic_artifact().dump());
    EXPECT_EQ(klass.artifact_hash, fr("0x257278ccff1f7ff7284fb56db42338d88b8a78a92c0534fc64634930771ae72d"));
    EXPECT_EQ(klass.private_functions_root, fr("0x1b263b4dffaba18054efc41302dd3171f88ca63e309603df62336abc8dcfdaff"));
    EXPECT_EQ(klass.public_bytecode_commitment,
              fr("0x0e46181cb2de0ed3132e08e0f60cd42faae3647cd7a54958762608fb613e8279"));
    EXPECT_EQ(klass.id, fr("0x2568cea93090fcf729c1f267cdb977a75c6553365c684ae9006465cfaafd5cff"));
}

TEST(AztecContractClass, IndependentOfOutputStructOrder)
{
    json artifact = synthetic_artifact();
    auto expected = bbapi::compute_aztec_contract_class(artifact.dump());
    for (const char* key : { "functions", "events" }) {
        auto& structs = artifact["outputs"]["structs"][key];
        std::reverse(structs.begin(), structs.end());
    }
    EXPECT_EQ(bbapi::compute_aztec_contract_class(artifact.dump()).id, expected.id);
}

TEST(AztecContractClass, PublicFunctionsOtherThanDispatchDoNotCount)
{
    json artifact = synthetic_artifact();
    auto expected = bbapi::compute_aztec_contract_class(artifact.dump());
    artifact["functions"].erase(3);
    EXPECT_EQ(bbapi::compute_aztec_contract_class(artifact.dump()).id, expected.id);
}

TEST(AztecContractClass, UtilityBytecodeMovesOnlyTheArtifactHash)
{
    json artifact = synthetic_artifact();
    auto expected = bbapi::compute_aztec_contract_class(artifact.dump());
    artifact["functions"][2]["bytecode"] = "CA==";
    auto changed = bbapi::compute_aztec_contract_class(artifact.dump());
    EXPECT_NE(changed.artifact_hash, expected.artifact_hash);
    EXPECT_EQ(changed.private_functions_root, expected.private_functions_root);
    EXPECT_EQ(changed.public_bytecode_commitment, expected.public_bytecode_commitment);
}
