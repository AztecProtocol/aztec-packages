// @ts-check
// Sidebar configuration for Participate documentation
// Non-versioned educational content about the Aztec network

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  participateSidebar: [
    { type: "doc", id: "index", label: "Overview" },
    {
      type: "html",
      value: '<span class="sidebar-title">Basics of Aztec</span>',
      className: "sidebar-title",
    },
    "basics/addresses",
    "basics/wallets",
    "basics/fees",
    "basics/transactions",
    "basics/blocks",
    "basics/bridging",
    {
      type: "html",
      value: '<span class="sidebar-title">Token</span>',
      className: "sidebar-title",
    },
    "token/index",
    "token/staking",
    "token/delegation",
    "token/voting",
    "token/economics",
    {
      type: "html",
      value: '<span class="sidebar-title">Governance</span>',
      className: "sidebar-title",
    },
    "governance/index",
    "governance/proposal-lifecycle",
    "governance/voting",
    "governance/gse",
    "governance/upgrades",
    "governance/contracts",
  ],
};

module.exports = sidebars;
