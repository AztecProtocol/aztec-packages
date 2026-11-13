// The site footer's links and copyright: docusaurus.config.js serves them as themeConfig.footer, and
// scripts/check_built_site.mts fails a build whose footer shows other links.

module.exports = {
  style: "dark",
  links: [
    {
      title: "Docs",
      items: [
        {
          label: "Introduction",
          to: "/",
        },
        {
          label: "Aztec.nr",
          to: "https://github.com/aztec-labs-eng/aztec-nr",
        },
      ],
    },
    {
      title: "Community",
      items: [
        {
          label: "Support",
          to: "/developers/support",
        },
        {
          label: "Forum",
          href: "https://forum.aztec.network",
        },
        {
          label: "Discord",
          href: "https://discord.gg/aztec",
        },
        {
          label: "Noir Discord",
          href: "https://discord.com/invite/JtqzkdeQ6G",
        },
        {
          label: "X (Twitter)",
          href: "https://x.com/aztecnetwork",
        },
      ],
    },
    {
      title: "More",
      items: [
        {
          label: "GitHub",
          href: "https://github.com/AztecProtocol",
        },
        {
          label: "Awesome Aztec",
          to: "https://github.com/AztecProtocol/awesome-aztec",
        },
        {
          label: "Technical Whitepaper",
          href: "https://aztec.network/technical-whitepaper",
        },
        {
          label: "Economic Whitepaper",
          href: "https://aztec.network/economic-whitepaper",
        },
      ],
    },
  ],
  copyright: `Copyright © ${new Date().getFullYear()} Aztec, built with Docusaurus, powered by <a target="_blank" href="https://netlify.com">Netlify.</a>`,
};
