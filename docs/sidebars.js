/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },

    // ABOUT AZTEC

    {
      type: "html",
      className: "sidebar-title",
      value: "LEARN",
      defaultStyle: true,
    },

    "landing",
    "learn/what_is_aztec",
    "learn/technical_overview",
  
    {
      type: "html",
      value: '<span clasuns="sidebar-divider" />',
    },

    // SPECIFICATION

    {
      label: "Concepts",
      type: "category",
      items: [
        {
          label: "Hybrid State Model",
          type: "category",
          link: {
            type: "doc",
            id: "learn/concepts/hybrid_state/main",
          },
          items: [
            "learn/concepts/hybrid_state/public_vm",
          ],
        },
        {
          label: "Storage",
          type: "category",
          items: [
            {
              label: "Trees",
              type: "category",
              link: {
                type: "doc",
                id: "learn/concepts/storage/trees/main",
              },
              items: [
                "learn/concepts/storage/trees/indexed_merkle_tree",
              ],
            },
            "learn/concepts/storage/storage_slots",
          ],
        },
        {
          label: "Accounts",
          type: "category",
          link: {
            type: "doc",
            id: "learn/concepts/accounts/main",
          },
          items: [
            "learn/concepts/accounts/keys",
            "learn/concepts/accounts/authwit",
          ],
        },
        "learn/concepts/transactions",
        {
          label: "Smart Contracts",
          type: "category",
          link: {
            type: "doc",
            id: "learn/concepts/smart_contracts/main",
          },
          items: [
            "learn/concepts/smart_contracts/contract_creation",
          ],
        },
        {
          label: "Communication",
          type: "category",
          items: [
            {
              label: "Public <> Private Communication",
              type: "category",
              link: {
                type: "doc",
                id: "learn/concepts/communication/public_private_calls/main",
              },
              items: [
                "learn/concepts/communication/public_private_calls/slow_updates_tree",
              ],
            },
            "learn/concepts/communication/cross_chain_calls",
          ],
        },
        {
          label: "Private Execution Environment (PXE)",
          type: "category",
          link: {
            type: "doc",
            id: "learn/concepts/pxe/main",
          },
          items: [
            "learn/concepts/pxe/acir_simulator",
          ],
        },
        {
          label: "Circuits",
          type: "category",
          link: {
            type: "doc",
            id: "learn/concepts/circuits/main",
          },
          items: [
            {
              label: "Kernel Circuits",
              type: "category",
              items: [
                "learn/concepts/circuits/kernels/private_kernel",
                "learn/concepts/circuits/kernels/public_kernel",
              ],
            },
            "learn/concepts/circuits/rollup_circuits",
          ],
        },
        {
          label: "Nodes and Clients",
          type: "category",
          items: [
            {
              label: "Sequencer",
              link: {
                type: "doc",
                id: "learn/concepts/nodes_clients/sequencer/main",
              },
              type: "category",
              items: [
                "learn/concepts/nodes_clients/sequencer/sequencer_selection",
              ],
            },
          ],
        },
      ],
    },

    // DEVELOPER DOCUMENTATION

    {
      type: "html",
      className: "sidebar-title",
      value: "BUILD",
      defaultStyle: true,
    },

    {
      label: "Getting Started",
      type: "category",
      link: {
        type: "doc",
        id: "build/getting_started/main",
      },
      items: [
        "build/getting_started/quickstart",
        "build/getting_started/core-concepts",
        "build/getting_started/aztecnr-getting-started",
        "build/getting_started/aztecjs-getting-started",
      ],
    },

    {
      label: "Tutorials",
      type: "category",
      link: {
        type: "doc",
        id: "build/tutorials/main",
      },
      items: [
        "build/tutorials/writing_token_contract",
        "build/tutorials/writing_private_voting_contract",

        {
          label: "Writing a DApp",
          type: "category",
          link: {
            type: "doc",
            id: "build/tutorials/writing_dapp/main",
          },
          items: [
            "build/tutorials/writing_dapp/project_setup",
            "build/tutorials/writing_dapp/pxe_service",
            "build/tutorials/writing_dapp/contract_deployment",
            "build/tutorials/writing_dapp/contract_interaction",
            "build/tutorials/writing_dapp/testing",
          ],
        },
        {
          label: "Build a Token Bridge",
          type: "category",
          link: {
            type: "doc",
            id: "build/tutorials/token_portal/main",
          },
          items: [
            "build/tutorials/token_portal/setup",
            "build/tutorials/token_portal/depositing_to_aztec",
            "build/tutorials/token_portal/minting_on_aztec",
            "build/tutorials/token_portal/cancelling_deposits",
            "build/tutorials/token_portal/withdrawing_to_l1",
            "build/tutorials/token_portal/typescript_glue_code",
          ],
        },
        {
          label: "Swap on L1 Uniswap from L2 with Portals",
          type: "category",
          link: {
            type: "doc",
            id: "build/tutorials/uniswap/main",
          },
          items: [
            "build/tutorials/uniswap/setup",
            "build/tutorials/uniswap/l1_portal",
            "build/tutorials/uniswap/l2_contract_setup",
            "build/tutorials/uniswap/swap_publicly",
            "build/tutorials/uniswap/execute_public_swap_on_l1",
            "build/tutorials/uniswap/swap_privately",
            "build/tutorials/uniswap/execute_private_swap_on_l1",
            "build/tutorials/uniswap/redeeming_swapped_assets_on_l2",
            "build/tutorials/uniswap/typescript_glue_code",
          ],
        },
        "build/tutorials/testing",
      ],
    },

    {
      label: "Aztec Sandbox and CLI",
      type: "category",
      link: {
        type: "doc",
        id: "build/cli/main",
      },
      items: [
        "build/cli/cli-commands",
        "build/cli/sandbox-reference",
        "build/cli/run_more_than_one_pxe_sandbox"
      ],
    },
    {
      label: "Aztec.nr Contracts",
      type: "category",
      link: {
        type: "doc",
        id: "build/contracts/main",
      },
      items: [
        "build/contracts/workflow",
        "build/contracts/setup",
        "build/contracts/layout",
        {
          label: "Syntax",
          type: "category",
          link: {
            type: "doc",
            id: "build/contracts/syntax/main",
          },
          items: [
            {
              label: "Storage",
              type: "category",
              link: {
                type: "doc",
                id: "build/contracts/syntax/storage/main",
              },
              items: ["build/contracts/syntax/storage/storage_slots"],
            },
            "build/contracts/syntax/events",
            "build/contracts/syntax/functions",
            "build/contracts/syntax/oracles",
            {
              label: "Proving Historical Blockchain Data",
              type: "category",
              items: [
                "build/contracts/syntax/historical_access/how_to_prove_history",
                "build/contracts/syntax/historical_access/history_lib_reference",
            ],
            },
            "build/contracts/syntax/slow_updates_tree",
            
            "build/contracts/syntax/context",
            "build/contracts/syntax/globals",
          ],
        },
        "build/contracts/compiling",
        "build/contracts/deploying",
        "build/contracts/artifacts",
        {
          label: "Portals",
          type: "category",
          link: {
            type: "doc",
            id: "build/contracts/portals/main",
          },
          items: [
            "build/contracts/portals/data_structures",
            "build/contracts/portals/registry",
            "build/contracts/portals/inbox",
            "build/contracts/portals/outbox",
          ],
        },
        {
          label: "Resources",
          type: "category",
          items: [
            "build/contracts/resources/dependencies",
            //"build/contracts/resources/style_guide",
            {
              label: "Common Patterns",
              type: "category",
              link: {
                type: "doc",
                id: "build/contracts/resources/common_patterns/main",
              },
              items: [
                "build/contracts/resources/common_patterns/authwit",
                //         "build/contracts/resources/common_patterns/sending_tokens_to_user",
                //         "build/contracts/resources/common_patterns/sending_tokens_to_contract",
                //         "build/contracts/resources/common_patterns/access_control",
                //         "build/contracts/resources/common_patterns/interacting_with_l1",
              ],
            },
          ],
        },
        // {
        //   label: "Security Considerations",
        //   type: "category",
        //   items: [
        //     {
        //       label: "Breaking changes",
        //       type: "category",
        //       link: {
        //         type: "doc",
        //         id: "build/contracts/security/breaking_changes/main",
        //       },
        //       items: ["build/contracts/security/breaking_changes/v0"],
        //     },
        //   ],
        // },
      ],
    },

    {
      label: "Aztec.js",
      type: "doc",
      id: "build/aztecjs/main",
    },
    {
      label: "Debugging",
      type: "category",
      link: {
        type: "doc",
        id: "build/debugging/main",
      },
      items: [
        "build/debugging/aztecnr-errors",
        "build/debugging/sandbox-errors",
      ],
    },
    {
      label: "Updating",
      type: "doc",
      id: "build/updating",
    },

    {
      label: "Testing",
      type: "category",
      link: {
        type: "doc",
        id: "build/testing/main",
      },
      items: ["build/testing/cheat_codes"],
    },
    {
      label: "Wallets",
      type: "category",
      link: {
        type: "doc",
        id: "build/wallets/main",
      },
      items: [
        "build/wallets/architecture",
        "build/wallets/writing_an_account_contract",
        "build/wallets/creating_schnorr_accounts",
      ],
    },

    /*    {
      label: "Security Considerations",
      type: "category",
      items: [],
    },*/
    "build/privacy/main",
    "build/limitations/main",

    {
      label: "API Reference",
      type: "category",
      items: [
        {
          label: "Private Execution Environment (PXE)",
          type: "doc",
          id: "apis/pxe/interfaces/PXE",
        },
        {
          label: "Aztec.js",
          type: "category",
          items: [{ dirName: "apis/aztec-js", type: "autogenerated" }],
        },
        {
          label: "Accounts",
          type: "category",
          items: [{ dirName: "apis/accounts", type: "autogenerated" }],
        },
      ],
    },

    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },

    // MISCELLANEOUS

    {
      type: "html",
      className: "sidebar-title",
      value: "MISCELLANEOUS",
      defaultStyle: true,
    },
    "misc/migration_notes",
    "misc/glossary",
    {
      label: "Roadmap",
      type: "category",
      link: {
        type: "doc",
        id: "misc/roadmap/main",
      },
      items: [
        "misc/roadmap/features_initial_ldt",
        "misc/roadmap/cryptography_roadmap",
      ],
    },
    "misc/how_to_contribute",

    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },

    "misc/aztec_connect_sunset",
  ],
};

module.exports = sidebars;
