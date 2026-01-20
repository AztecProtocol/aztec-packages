// @ts-check
// Sidebar configuration for Network documentation
// Supports three sections: Concepts, Users, and Operators

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // ============================================
  // CONCEPTS SIDEBAR
  // ============================================
  conceptsSidebar: [
    {
      type: "html",
      value: '<a class="sidebar-back-link" href="/network/dev/">← Back to Network</a>',
      className: "sidebar-back-link-wrapper",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">Concepts</span>',
      className: "sidebar-title",
    },
    {
      type: "doc",
      id: "concepts/index",
      label: "Overview",
    },
    {
      type: "category",
      label: "Network Architecture",
      link: {
        type: "doc",
        id: "concepts/architecture/index",
      },
      items: [
        "concepts/architecture/block-production",
        "concepts/architecture/proving-coordination",
      ],
    },
    {
      type: "doc",
      id: "concepts/proof-of-stake/index",
      label: "Proof of Stake",
    },
    {
      type: "category",
      label: "Governance",
      link: {
        type: "doc",
        id: "concepts/governance/index",
      },
      items: [
        "concepts/governance/proposal-lifecycle",
        "concepts/governance/voting",
        "concepts/governance/gse",
        "concepts/governance/upgrades",
      ],
    },
    {
      type: "doc",
      id: "concepts/contracts/deployment-architecture",
      label: "L1 Contracts",
    },
  ],

  // ============================================
  // USERS SIDEBAR
  // ============================================
  usersSidebar: [
    {
      type: "html",
      value: '<a class="sidebar-back-link" href="/network/dev/">← Back to Network</a>',
      className: "sidebar-back-link-wrapper",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">User Guides</span>',
      className: "sidebar-title",
    },
    {
      type: "doc",
      id: "users/index",
      label: "Overview",
    },
    {
      type: "doc",
      id: "users/staking",
      label: "Staking Tokens",
    },
    {
      type: "doc",
      id: "users/delegation",
      label: "Delegating Stake",
    },
    {
      type: "doc",
      id: "users/voting",
      label: "Voting on Proposals",
    },
  ],

  // ============================================
  // OPERATORS SIDEBAR
  // IDs match actual doc IDs (mix of underscores from frontmatter and dashes from file paths)
  // ============================================
  operatorsSidebar: [
    {
      type: "html",
      value: '<a class="sidebar-back-link" href="/network/dev/">← Back to Network</a>',
      className: "sidebar-back-link-wrapper",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">Getting Started</span>',
      className: "sidebar-title",
    },
    {
      type: "doc",
      id: "operators/index",
      label: "Operator Overview",
    },
    {
      type: "doc",
      id: "operators/prerequisites",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">Setup</span>',
      className: "sidebar-title",
    },
    {
      type: "doc",
      id: "operators/setup/running_a_node",
    },
    {
      type: "category",
      label: "Running a Sequencer",
      link: {
        type: "doc",
        id: "operators/setup/sequencer_management",
      },
      items: [
        "operators/setup/registering_sequencer",
        "operators/setup/become_a_staking_provider",
        "operators/setup/high_availability_sequencers",
      ],
    },
    {
      type: "doc",
      id: "operators/setup/running_a_prover",
    },
    {
      type: "doc",
      id: "operators/setup/building_from_source",
    },
    {
      type: "doc",
      id: "operators/setup/bootnode_operation",
    },
    {
      type: "doc",
      id: "operators/setup/syncing_best_practices",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">Operation</span>',
      className: "sidebar-title",
    },
    {
      type: "category",
      label: "Monitoring",
      link: {
        type: "doc",
        id: "operators/monitoring/monitoring",
      },
      items: [
        {
          type: "category",
          label: "Setup Guides",
          items: [
            "operators/monitoring/otel-setup",
            "operators/monitoring/prometheus-setup",
            "operators/monitoring/grafana-setup",
          ],
        },
        "operators/monitoring/metrics-reference",
        "operators/monitoring/troubleshooting",
      ],
    },
    {
      type: "category",
      label: "Keystore Management",
      link: {
        type: "doc",
        id: "operators/keystore/advanced_keystore_guide",
      },
      items: [
        "operators/keystore/creating_keystores",
        "operators/keystore/storage-methods",
        "operators/keystore/advanced-patterns",
        "operators/keystore/examples",
        "operators/keystore/troubleshooting",
      ],
    },
    {
      type: "category",
      label: "Sequencer Management",
      link: {
        type: "doc",
        id: "operators/sequencer-management/sequencer_management_overview",
      },
      items: [
        "operators/sequencer-management/creating_and_voting_on_proposals",
        "operators/sequencer-management/slashing_and_offenses",
        "operators/sequencer-management/claiming-rewards",
        "operators/sequencer-management/useful-commands",
      ],
    },
    {
      type: "doc",
      id: "operators/operator-faq",
    },
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">Reference</span>',
      className: "sidebar-title",
    },
    {
      type: "category",
      label: "Changelog",
      link: {
        type: "doc",
        id: "operators/reference/changelog/changelog",
      },
      items: ["operators/reference/changelog/v2.0.2"],
    },
    {
      type: "doc",
      id: "operators/reference/cli-reference",
    },
    {
      type: "doc",
      id: "operators/reference/node_api_reference",
    },
    {
      type: "doc",
      id: "operators/reference/ethereum_rpc_reference",
    },
    {
      type: "doc",
      id: "operators/reference/glossary",
    },
  ],
};

module.exports = sidebars;
