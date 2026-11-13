// The site footer's links and copyright: docusaurus.config.js serves them as themeConfig.footer, and
// scripts/check_built_site.mts fails a build whose footer shows other links.
// src/theme/Footer renders an `href` item as a same-tab link with the external-link icon, and a `to` item
// through @docusaurus/Link, which opens an external URL in a new tab: external URLs go under `href`.

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
          href: "https://github.com/aztec-labs-eng/aztec-nr",
        },
      ],
    },
    {
      title: "Community",
      items: [
        {
          label: "Forum",
          href: "https://forum.aztec.network",
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
          href: "https://github.com/AztecProtocol/awesome-aztec",
        },
      ],
    },
  ],
  copyright: `© ${new Date().getFullYear()} Aztec Labs. Freedom to move unseen.`,
};
