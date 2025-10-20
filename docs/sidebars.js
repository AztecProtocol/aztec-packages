// @ts-check

const fs = require("fs");
const path = require("path");

const sidebar = {
  sidebar: [
    // 1. Aztec Overview
    {
      type: "doc",
      id: "aztec-overview/index",
      label: "1. Aztec Overview"
    },

    // 2. Getting Started
    {
      type: "doc",
      id: "getting-started/index",
      label: "2. Getting Started"
    },

    // 3. Aztec vs Ethereum
    {
      type: "doc",
      id: "aztec-vs-ethereum/index",
      label: "3. Aztec vs Ethereum"
    },

    // 4. Protocol Architecture
    {
      type: "category",
      label: "4. Protocol Architecture",
      items: [
        {
          type: "doc",
          id: "protocol-architecture/overview",
          label: "4.1 Overview"
        },
        {
          type: "doc",
          id: "protocol-architecture/addresses-keys",
          label: "4.2 Addresses & Keys"
        },
        {
          type: "doc",
          id: "protocol-architecture/wallets",
          label: "4.3 Wallets"
        },
        {
          type: "doc",
          id: "protocol-architecture/call-types",
          label: "4.4 Call Types"
        },
        {
          type: "doc",
          id: "protocol-architecture/transactions",
          label: "4.5 Transactions"
        },
        {
          type: "doc",
          id: "protocol-architecture/fees",
          label: "4.6 Fees"
        },
        {
          type: "doc",
          id: "protocol-architecture/nullifier-merkle-tree",
          label: "4.7 Nullifier Merkle Tree"
        },
        {
          type: "doc",
          id: "protocol-architecture/note-discovery",
          label: "4.8 Note Discovery"
        },
        {
          type: "doc",
          id: "protocol-architecture/circuits",
          label: "4.9 Circuits"
        },
        {
          type: "doc",
          id: "protocol-architecture/storage-slots",
          label: "4.10 Storage Slots"
        }
      ]
    },

    // 5. Aztec.nr
    {
      type: "category",
      label: "5. Aztec.nr",
      items: [
        {
          type: "doc",
          id: "aztec-nr/overview",
          label: "5.1 Overview"
        },
        {
          type: "category",
          label: "5.2 Introduction to Private Smart Contracts",
          items: [
            {
              type: "doc",
              id: "aztec-nr/intro-private-contracts",
              label: "Overview"
            },
            {
              type: "doc",
              id: "aztec-nr/02-01-simple-contract",
              label: "5.2.1 A Simple Aztec Smart Contract"
            },
            {
              type: "doc",
              id: "aztec-nr/02-02-example-contracts",
              label: "5.2.2 Example Aztec Smart Contracts"
            }
          ]
        },
        {
          type: "doc",
          id: "aztec-nr/installation",
          label: "5.3 Installation"
        },
        {
          type: "category",
          label: "5.4 Language Description",
          items: [
            {
              type: "doc",
              id: "aztec-nr/language-description",
              label: "Overview"
            },
            {
              type: "doc",
              id: "aztec-nr/04-01-project-structure",
              label: "5.4.1 Project Structure"
            },
            {
              type: "doc",
              id: "aztec-nr/04-02-contract-structure",
              label: "5.4.2 Contract Structure"
            },
            {
              type: "doc",
              id: "aztec-nr/04-03-declaring-contract",
              label: "5.4.3 Declaring a Contract"
            },
            {
              type: "doc",
              id: "aztec-nr/04-04-functions",
              label: "5.4.4 Functions"
            },
            {
              type: "doc",
              id: "aztec-nr/04-05-calling-contracts",
              label: "5.4.5 Calling Other Contracts"
            },
            {
              type: "doc",
              id: "aztec-nr/04-06-aztec-attributes",
              label: "5.4.6 Aztec Attributes"
            },
            {
              type: "doc",
              id: "aztec-nr/04-07-global-variables",
              label: "5.4.7 Global Variables"
            },
            {
              type: "doc",
              id: "aztec-nr/04-08-state-variables",
              label: "5.4.8 State Variables"
            },
            {
              type: "doc",
              id: "aztec-nr/04-09-events-logs",
              label: "5.4.9 Events and Logs"
            },
            {
              type: "doc",
              id: "aztec-nr/04-10-private-messaging",
              label: "5.4.10 Private Messaging"
            },
            {
              type: "doc",
              id: "aztec-nr/04-11-l1-l2-messaging",
              label: "5.4.11 L1<>L2 Messaging"
            },
            {
              type: "doc",
              id: "aztec-nr/04-12-cross-chain",
              label: "5.4.12 Cross-chain Interactions"
            },
            {
              type: "doc",
              id: "aztec-nr/04-13-macros",
              label: "5.4.13 Macros"
            },
            {
              type: "doc",
              id: "aztec-nr/04-14-protocol-oracles",
              label: "5.4.14 Protocol Oracles"
            },
            {
              type: "doc",
              id: "aztec-nr/04-15-libraries",
              label: "5.4.15 Libraries"
            },
            {
              type: "doc",
              id: "aztec-nr/04-16-upgradeable-contracts",
              label: "5.4.16 Upgradeable Contracts"
            },
            {
              type: "doc",
              id: "aztec-nr/04-17-error-handling",
              label: "5.4.17 Error Handling"
            },
            {
              type: "doc",
              id: "aztec-nr/04-18-cosnarks",
              label: "5.4.18 CoSnarks"
            },
            {
              type: "doc",
              id: "aztec-nr/04-19-auth-witness",
              label: "5.4.19 Authentication Witness"
            }
          ]
        },
        {
          type: "doc",
          id: "aztec-nr/compiling",
          label: "5.5 Compiling"
        },
        {
          type: "doc",
          id: "aztec-nr/testing",
          label: "5.6 Testing"
        },
        {
          type: "doc",
          id: "aztec-nr/debugging",
          label: "5.7 Debugging"
        },
        {
          type: "doc",
          id: "aztec-nr/deploying",
          label: "5.8 Deploying"
        },
        {
          type: "category",
          label: "5.9 Advanced Features",
          items: [
            {
              type: "doc",
              id: "aztec-nr/advanced-features",
              label: "Overview"
            },
            {
              type: "doc",
              id: "aztec-nr/09-01-custom-notes",
              label: "5.9.1 Custom Notes"
            }
          ]
        },
        {
          type: "doc",
          id: "aztec-nr/common-patterns",
          label: "5.10 Common Patterns"
        },
        {
          type: "category",
          label: "5.11 Optimizations, Gas and Profiling",
          items: [
            {
              type: "doc",
              id: "aztec-nr/optimizations",
              label: "Overview"
            },
            {
              type: "doc",
              id: "aztec-nr/11-01-gas",
              label: "5.11.1 Gas"
            },
            {
              type: "doc",
              id: "aztec-nr/11-02-profiling",
              label: "5.11.2 Profiling"
            },
            {
              type: "doc",
              id: "aztec-nr/11-03-optimizing-functions",
              label: "5.11.3 Optimizing Functions"
            },
            {
              type: "doc",
              id: "aztec-nr/11-04-numeric-types",
              label: "5.11.4 Choosing Numeric Types"
            }
          ]
        },
        {
          type: "doc",
          id: "aztec-nr/protocol-upgrades",
          label: "5.12 Protocol Upgrades"
        },
        {
          type: "doc",
          id: "aztec-nr/reference",
          label: "5.13 Reference"
        }
      ]
    },

    // 6. Aztec.js
    {
      type: "category",
      label: "6. Aztec.js",
      items: [
        {
          type: "doc",
          id: "aztec-js/overview",
          label: "6.1 Overview"
        },
        {
          type: "doc",
          id: "aztec-js/getting-started",
          label: "6.2 Getting Started"
        },
        {
          type: "doc",
          id: "aztec-js/reference",
          label: "6.3 Reference"
        }
      ]
    },

    // 7. Aztec Nargo
    {
      type: "category",
      label: "7. Aztec Nargo",
      items: [
        {
          type: "doc",
          id: "aztec-nargo/overview",
          label: "7.1 Overview"
        },
        {
          type: "doc",
          id: "aztec-nargo/getting-started",
          label: "7.2 Getting Started"
        },
        {
          type: "doc",
          id: "aztec-nargo/reference",
          label: "7.3 Reference"
        }
      ]
    },

    // 8. Aztec CLI
    {
      type: "category",
      label: "8. Aztec CLI",
      items: [
        {
          type: "doc",
          id: "aztec-cli/overview",
          label: "8.1 Overview"
        },
        {
          type: "doc",
          id: "aztec-cli/getting-started",
          label: "8.2 Getting Started"
        },
        {
          type: "doc",
          id: "aztec-cli/reference",
          label: "8.3 Reference"
        }
      ]
    },

    // 9. Wallet CLI
    {
      type: "category",
      label: "9. Wallet CLI",
      items: [
        {
          type: "doc",
          id: "wallet-cli/overview",
          label: "9.1 Overview"
        },
        {
          type: "doc",
          id: "wallet-cli/getting-started",
          label: "9.2 Getting Started"
        },
        {
          type: "doc",
          id: "wallet-cli/reference",
          label: "9.3 Reference"
        }
      ]
    },

    // 10. Resources
    {
      type: "category",
      label: "10. Resources",
      items: [
        {
          type: "doc",
          id: "resources/index",
          label: "Overview"
        },
        {
          type: "doc",
          id: "resources/glossary",
          label: "Glossary"
        }
      ]
    }
  ],

  // Keep existing sidebars for other sections
  "nodesSidebar": [
    {
      "type": "html",
      "value": "<span class=\"sidebar-title\">Getting Started</span>",
      "className": "sidebar-title"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/index"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/prerequisites"
    },
    {
      "type": "html",
      "value": "<span class=\"sidebar-divider\" />"
    },
    {
      "type": "html",
      "value": "<span class=\"sidebar-title\">Setup</span>",
      "className": "sidebar-title"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/setup/running_a_node"
    },
    {
      "type": "category",
      "label": "Running a Sequencer",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/setup/sequencer_management"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/setup/high_availability_sequencers"
        }
      ]
    },
    {
      "type": "category",
      "label": "Running a Prover",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/setup/running_a_prover"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/setup/prover_single_machine"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/setup/prover_distributed"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/setup/prover_verification_troubleshooting"
        }
      ]
    },
    {
      "type": "doc",
      "id": "the_aztec_network/setup/bootnode_operation"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/setup/syncing_best_practices"
    },
    {
      "type": "html",
      "value": "<span class=\"sidebar-title\">Operation</span>",
      "className": "sidebar-title"
    },
    {
      "type": "category",
      "label": "Monitoring",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/operation/monitoring"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/operation/otel_setup"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/prometheus_setup"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/grafana_setup"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/monitoring_example_troubleshooting"
        }
      ]
    },
    {
      "type": "category",
      "label": "Advanced Keystore Usage",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/operation/keystore/advanced_keystore_guide"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/operation/keystore/storage_methods"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/keystore/advanced_patterns"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/keystore/troubleshooting"
        }
      ]
    },
    {
      "type": "category",
      "label": "Sequencer Management",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/operation/sequencer_management/sequencer_management_overview"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/operation/sequencer_management/creating_and_voting_on_proposals"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/sequencer_management/running_delegated_stake"
        },
        {
          "type": "doc",
          "id": "the_aztec_network/operation/sequencer_management/useful_commands"
        }
      ]
    },
    {
      "type": "doc",
      "id": "the_aztec_network/operation/operator_faq"
    },
    {
      "type": "html",
      "value": "<span class=\"sidebar-divider\" />"
    },
    {
      "type": "html",
      "value": "<span class=\"sidebar-title\">Reference</span>",
      "className": "sidebar-title"
    },
    {
      "type": "category",
      "label": "Changelog",
      "link": {
        "type": "doc",
        "id": "the_aztec_network/reference/changelog/changelog"
      },
      "items": [
        {
          "type": "doc",
          "id": "the_aztec_network/reference/changelog/v2.0.2"
        }
      ]
    },
    {
      "type": "doc",
      "id": "the_aztec_network/reference/cli_reference"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/reference/node_api_reference"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/reference/ethereum_rpc_reference"
    },
    {
      "type": "doc",
      "id": "the_aztec_network/reference/glossary"
    }
  ]
};

const protocolSpecSidebar = [
  "protocol-specs/intro",
  {
    label: "Cryptography",
    type: "category",
    link: { type: "doc", id: "protocol-specs/cryptography/index" },
    items: [
      {
        label: "Proving System",
        type: "category",
        items: [
          "protocol-specs/cryptography/proving-system/performance-targets",
          "protocol-specs/cryptography/proving-system/overview",
          "protocol-specs/cryptography/proving-system/data-bus",
        ],
      },
      {
        label: "Hashing",
        type: "category",
        items: [
          "protocol-specs/cryptography/hashing/hashing",
          "protocol-specs/cryptography/hashing/poseidon2",
          "protocol-specs/cryptography/hashing/pedersen",
        ],
      },
      "protocol-specs/cryptography/merkle-trees",
    ],
  },
  {
    label: "Addresses & Keys",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/addresses-and-keys/index",
    },
    items: [
      "protocol-specs/addresses-and-keys/address",
      "protocol-specs/addresses-and-keys/keys-requirements",
      "protocol-specs/addresses-and-keys/keys",
      {
        label: "Example Usage of Keys",
        type: "category",
        items: [
          "protocol-specs/addresses-and-keys/example-usage/nullifier",
          "protocol-specs/addresses-and-keys/example-usage/diversified-and-stealth-keys",
          "protocol-specs/addresses-and-keys/example-usage/tag-sequence-derivation",
          "protocol-specs/addresses-and-keys/example-usage/encrypt-and-tag",
        ],
      },
      "protocol-specs/addresses-and-keys/precompiles",
      "protocol-specs/addresses-and-keys/diversified-and-stealth",
    ],
  },
  {
    label: "State",
    type: "category",
    link: { type: "doc", id: "protocol-specs/state/index" },
    items: [
      "protocol-specs/state/tree-implementations",
      "protocol-specs/state/archive",
      "protocol-specs/state/note-hash-tree",
      "protocol-specs/state/nullifier-tree",
      "protocol-specs/state/public-data-tree",
      "protocol-specs/state/wonky-tree",
    ],
  },
  {
    label: "Transactions",
    type: "category",
    link: { type: "doc", id: "protocol-specs/transactions/index" },
    items: [
      "protocol-specs/transactions/local-execution",
      "protocol-specs/transactions/public-execution",
      "protocol-specs/transactions/tx-object",
      "protocol-specs/transactions/validity",
    ],
  },
  {
    label: "Bytecode",
    type: "category",
    link: { type: "doc", id: "protocol-specs/bytecode/index" },
    items: [],
  },
  {
    label: "Contract Deployment",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/contract-deployment/index",
    },
    items: [
      "protocol-specs/contract-deployment/classes",
      "protocol-specs/contract-deployment/instances",
    ],
  },
  {
    label: "Calls",
    type: "category",
    link: { type: "doc", id: "protocol-specs/calls/index" },
    items: [
      "protocol-specs/calls/sync-calls",
      "protocol-specs/calls/enqueued-calls",
      "protocol-specs/calls/batched-calls",
      "protocol-specs/calls/static-calls",
      "protocol-specs/calls/unconstrained-calls",
      "protocol-specs/calls/public-private-messaging",
    ],
  },
  {
    label: "L1 smart contracts",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/l1-smart-contracts/index",
    },
    items: ["protocol-specs/l1-smart-contracts/frontier"],
  },
  {
    label: "Data availability",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/data-publication-and-availability/index",
    },
    items: [
      "protocol-specs/data-publication-and-availability/overview",
      "protocol-specs/data-publication-and-availability/published-data",
      "protocol-specs/data-publication-and-availability/blobs",
    ],
  },
  {
    label: "Logs",
    type: "category",
    link: { type: "doc", id: "protocol-specs/logs/index" },
    items: [],
  },
  {
    label: "Pre-compiled Contracts",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/pre-compiled-contracts/index",
    },
    items: ["protocol-specs/pre-compiled-contracts/registry"],
  },
  {
    label: "Private Message Delivery",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/private-message-delivery/index",
    },
    items: [
      "protocol-specs/private-message-delivery/private-msg-delivery", // renamed to avoid routing problems
      "protocol-specs/private-message-delivery/send-note-guidelines",
    ],
  },
  {
    label: "Gas & Fees",
    type: "category",
    link: { type: "doc", id: "protocol-specs/gas-and-fees/index" },
    items: [
      "protocol-specs/gas-and-fees/fee-juice",
      "protocol-specs/gas-and-fees/specifying-gas-fee-info",
      "protocol-specs/gas-and-fees/tx-setup-and-teardown",
      "protocol-specs/gas-and-fees/kernel-tracking",
      "protocol-specs/gas-and-fees/fee-schedule",
      "protocol-specs/gas-and-fees/published-gas-and-fee-data",
    ],
  },
  {
    label: "Decentralization",
    type: "category",
    items: [
      "protocol-specs/decentralization/actors",
      "protocol-specs/decentralization/governance",
      "protocol-specs/decentralization/block-production",
      "protocol-specs/decentralization/p2p-network",
    ],
  },
  {
    label: "Circuits",
    type: "category",
    link: {
      type: "doc",
      id: "protocol-specs/circuits/high-level-topology",
    },
    items: [
      "protocol-specs/circuits/private-function",
      "protocol-specs/circuits/private-kernel-initial",
      "protocol-specs/circuits/private-kernel-inner",
      "protocol-specs/circuits/private-kernel-reset",
      "protocol-specs/circuits/private-kernel-tail",
      "protocol-specs/circuits/public-kernel-initial",
      "protocol-specs/circuits/public-kernel-inner",
      "protocol-specs/circuits/public-kernel-tail",
    ],
  },
  {
    label: "Rollup Circuits",
    type: "category",
    link: { type: "doc", id: "protocol-specs/rollup-circuits/index" },
    items: [
      "protocol-specs/rollup-circuits/base-rollup",
      "protocol-specs/rollup-circuits/merge-rollup",
      "protocol-specs/rollup-circuits/tree-parity",
      "protocol-specs/rollup-circuits/root-rollup",
    ],
  },
  {
    label: "Aztec (Public) VM",
    type: "category",
    link: { type: "doc", id: "protocol-specs/public-vm/index" },
    items: [
      "protocol-specs/public-vm/intro",
      "protocol-specs/public-vm/state",
      "protocol-specs/public-vm/memory-model",
      "protocol-specs/public-vm/context",
      "protocol-specs/public-vm/execution",
      "protocol-specs/public-vm/nested-calls",
      "protocol-specs/public-vm/instruction-set",
      {
        label: "AVM Circuit",
        type: "category",
        link: {
          type: "doc",
          id: "protocol-specs/public-vm/circuit-index",
        },
        items: [
          "protocol-specs/public-vm/avm-circuit",
          "protocol-specs/public-vm/control-flow",
          "protocol-specs/public-vm/alu",
          "protocol-specs/public-vm/bytecode-validation-circuit",
        ],
      },
      "protocol-specs/public-vm/type-structs",
    ],
  },
];

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
module.exports = sidebar;