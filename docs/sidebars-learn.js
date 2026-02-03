// @ts-check
// Sidebar configuration for Network documentation
// Supports three sections: Concepts, Users, and Operators

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // ============================================
  // SIDEBAR
  // ============================================
  sidebar: [
    {
      type: "html",
      value: '<span class="sidebar-divider" />',
    },
    {
      type: "html",
      value: '<span class="sidebar-title">$AZTEC</span>',
      className: "sidebar-title",
    },
    {
      type: "doc",
      id: "token/index",
      label: "Overview",
    },
    {
      type: "doc",
      id: "token/overview",
      label: "Overview",
    },
    {
      type: "doc",
      id: "token/staking",
      label: "Staking Tokens",
    },
    {
      type: "doc",
      id: "token/delegation",
      label: "Delegating Stake",
    },
    {
      type: "doc",
      id: "token/voting",
      label: "Voting on Proposals",
    },
  ],
};

module.exports = sidebars;
