// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require("prism-react-renderer");

// biome-ignore lint/suspicious/noTsIgnore: baselined 2026-11-12: nothing type-checks this file, so @ts-expect-error would go unverified
// @ts-ignore
import math from "remark-math";
// biome-ignore lint/suspicious/noTsIgnore: baselined 2026-11-12: nothing type-checks this file, so @ts-expect-error would go unverified
// @ts-ignore
import katex from "rehype-katex";

// biome-ignore lint/suspicious/noTsIgnore: baselined 2026-11-12: nothing type-checks this file, so @ts-expect-error would go unverified
// @ts-ignore
const path = require("path");
const macros = require("./src/katex-macros.js");
const { createRequire } = require("module");
const {
  apiReferenceDirs,
  apiReferenceFolder,
  aztecNrApiFolders,
  docsInstances,
  historicalVersions,
  lineApiFolders,
  lineInstances,
  llmsRoutes,
  syncVersionsFile,
} = require("./src/network_docs.js");
const { lineNames } = require("./src/preprocess/line.js");
const { versionLabel } = require("./src/release_names");

// Version config files are the source of truth for type→version mappings.
const syncVersions = (instance) =>
  syncVersionsFile(
    path.join(__dirname, `${instance}_version_config.json`),
    path.join(__dirname, `${instance}_versions.json`),
    path.join(__dirname, `${instance}_versioned_docs`)
  );
const developerVersionConfig = syncVersions("developer");
const networkVersionConfig = syncVersions("network");
const [developerDocs, operatorDocs] = docsInstances(
  developerVersionConfig,
  networkVersionConfig,
  process.env.CONTEXT === "production"
);
const developerApiFolders = aztecNrApiFolders(developerDocs);
// The dev lines (docs/lines/<line>/) serve in previews only, each beside the dev docs.
const lines = lineInstances(lineNames(path.join(__dirname, "..")), process.env.CONTEXT === "production");

const NETWORK_LABELS = { mainnet: "Alpha", testnet: "Testnet" };
// Docs versions track release lines, so each label carries the line name and
// exact version (src/release_names.js). The networks are only added when Alpha
// and Testnet run different versions and both appear in the dropdown. Cut
// versions no network reads stay browsable at their version name but are
// marked noindex (and kept out of llms.txt by llmsRoutes), so search engines
// and agents land on the current docs.
function versionOptions(instance, cutVersions) {
  const released = instance.versions.filter((v) => v.networks.length);
  return Object.fromEntries([
    ...instance.versions.map(({ version, networks, path }) => [
      version,
      networks.length
        ? {
            label:
              released.length === 1
                ? versionLabel(version)
                : versionLabel(version, networks.map((n) => NETWORK_LABELS[n]).join(" / ")),
            path,
            banner: "none",
          }
        : { label: "dev", path },
    ]),
    ...historicalVersions(instance, cutVersions).map((version) => [
      version,
      { label: versionLabel(version), noIndex: true },
    ]),
  ]);
}
const rootVersion = ({ versions }) => versions.find((v) => v.path === "")?.version;

const developerCutVersions = require("./developer_versions.json");
const networkCutVersions = require("./network_versions.json");
const llmsInstances = [
  llmsRoutes(developerDocs, developerCutVersions),
  llmsRoutes(operatorDocs, networkCutVersions),
];

// Within each instance's section, llms.txt groups pages by product area with
// readable headings instead of one flat list. A page whose segment count equals
// its depth becomes a heading of its own, so depth is only raised for
// directories; standalone pages keep the parent's depth. The most specific
// matching rule wins per page.
const productAreaRules = [
  {
    route: "/developers/docs/**",
    depth: 3,
    categoryName: "Guides and reference",
  },
  {
    route: "/developers/docs/foundational-topics/**",
    depth: 3,
    categoryName: "Foundational topics: how Aztec works",
  },
  {
    route: "/developers/docs/aztec-nr/**",
    depth: 3,
    categoryName: "Aztec.nr smart contract framework",
  },
  {
    route: "/developers/docs/aztec-js/**",
    depth: 3,
    categoryName: "aztec.js TypeScript SDK",
  },
  {
    route: "/developers/docs/tutorials/**",
    depth: 3,
    categoryName: "Tutorials",
  },
  {
    route: "/developers/docs/cli/**",
    depth: 3,
    categoryName: "Aztec CLI",
  },
  {
    route: "/developers/docs/resources/**",
    depth: 3,
    categoryName: "Resources",
  },
  {
    route: "/operate/operators/**",
    depth: 2,
    categoryName: "Node operators",
  },
  ...Object.entries({
    concepts: "Concepts",
    "full-node": "Full node",
    keystore: "Keystore",
    monitoring: "Monitoring",
    prover: "Prover",
    provider: "Provider",
    reference: "Reference and changelog",
    "sequencer-management": "Sequencer management",
    setup: "Setup",
    "solo-sequencer": "Solo sequencer",
    tooling: "Tooling",
  }).map(([segment, categoryName]) => ({
    route: `/operate/operators/${segment}/**`,
    depth: 3,
    categoryName,
  })),
  {
    route: "/operate/reference/**",
    depth: 2,
    categoryName: "Operator reference",
  },
  {
    route: "/participate/**",
    categoryName: "Participate: network, token, and governance",
  },
  { route: "/networks", categoryName: "Networks" },
  {
    route: "/aztec_connect_sunset",
    categoryName: "Aztec Connect sunset (legacy product)",
  },
];

const { SITE_URL } = require("./src/site_url");
const SITE_TITLE = "Aztec Documentation";
const SITE_DESCRIPTION =
  "Build unstoppable private apps on Aztec, the decentralized Ethereum L2 with fully programmable privacy.";
const OG_IMAGE_ALT =
  "Aztec documentation: build unstoppable private apps on the decentralized Ethereum L2 with fully programmable privacy";

// Site-wide entities for JSON-LD. Doc pages emit a TechArticle that references
// these by @id (see src/theme/DocItem/Metadata).
const ORGANIZATION_ID = "https://aztec.network/#organization";
const WEBSITE_ID = `${SITE_URL}/#website`;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "Aztec Labs",
      alternateName: ["Aztec", "Aztec Network"],
      url: "https://aztec.network",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/img/brand/favicon.png`,
      },
      sameAs: [
        "https://github.com/AztecProtocol",
        "https://x.com/aztecnetwork",
        "https://discord.com/invite/JtqzkdeQ6G",
        "https://forum.aztec.network",
      ],
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: SITE_TITLE,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": ORGANIZATION_ID },
    },
  ],
};

// Always serve from processed-docs (with resolved macros)
// Preprocessing runs on both `yarn start` and `yarn build`
const docsPath = "processed-docs/docs";
const developerDocsPath = "processed-docs/docs-developers";
const operateDocsPath = "processed-docs/docs-operate";
const participateDocsPath = "processed-docs/docs-participate";

// Shared remark/rehype plugins configuration
const remarkPlugins = [math];
const rehypePlugins = [
  [
    katex,
    {
      throwOnError: true,
      globalGroup: true,
      macros,
    },
  ],
];
// KaTeX's stylesheet must match the KaTeX that renders the markup, so it comes from rehype-katex's own
// katex dependency; the bundler serves it and its fonts from the site.
const katexCss = createRequire(require.resolve("rehype-katex")).resolve("katex/dist/katex.min.css");

const config = {
  title: SITE_TITLE,
  tagline: `${SITE_DESCRIPTION} Build freely. Stay private.`,
  url: `${SITE_URL}/`,
  baseUrl: "/",
  trailingSlash: false,
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",
  favicon: "img/brand/favicon.png",
  headTags: [
    {
      tagName: "script",
      attributes: { type: "application/ld+json" },
      innerHTML: JSON.stringify(structuredData),
    },
    {
      tagName: "link",
      attributes: {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/img/brand/apple-touch-icon.png",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "icon",
        type: "image/svg+xml",
        href: "/img/brand/favicon.svg",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "#fff9f2",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "#141900",
      },
    },
  ],

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Aztec Network", // Usually your GitHub org/user name.
  projectName: "docs", // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  future: {
    faster: true,
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
    },
  },
  themes: ["@docusaurus/theme-mermaid"],
  presets: [
    [
      "@docusaurus/preset-classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        // Disable docs from preset - we use separate plugins for multi-instance
        docs: false,
        blog: false,
        theme: {
          customCss: [katexCss, require.resolve("./src/css/custom.css")],
        },
        // Enable pages for root-level content (index.mdx, networks, etc.)
        pages: {
          path: "src/pages",
        },
        // Keep utility routes out of the sitemap so they don't count against
        // llms.txt coverage (they are also excluded from the llms.txt index).
        sitemap: {
          ignorePatterns: ["/search", "/**/tags", "/**/tags/**"],
        },
      },
    ],
  ],
  plugins: [
    // Developer docs instance - mainnet/testnet versions
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "developer",
        path: developerDocsPath,
        routeBasePath: "developers",
        sidebarPath: "./sidebars-developer.js",
        editUrl: (params) => {
          return (
            `https://github.com/AztecProtocol/aztec-packages/edit/next/docs/docs-developers/` +
            params.docPath
          );
        },
        // Version configuration for Build docs
        includeCurrentVersion: process.env.CONTEXT !== "production",
        lastVersion: rootVersion(developerDocs),
        versions: versionOptions(developerDocs, developerCutVersions),
        remarkPlugins,
        rehypePlugins,
      },
    ],
    // Operate docs instance (node operators) - alpha/testnet versions
    // Note: Plugin ID remains "network" for versioned docs compatibility (network_versioned_docs/)
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "network",
        path: operateDocsPath,
        routeBasePath: "operate",
        sidebarPath: "./sidebars-operate.js",
        editUrl: (params) => {
          return (
            `https://github.com/AztecProtocol/aztec-packages/edit/next/docs/docs-operate/` +
            params.docPath
          );
        },
        // Version configuration for Operate docs
        includeCurrentVersion: process.env.CONTEXT !== "production",
        lastVersion: rootVersion(operatorDocs),
        versions: versionOptions(operatorDocs, networkCutVersions),
        remarkPlugins,
        rehypePlugins,
      },
    ],
    ...lines.map(({ line, id, source, routeBasePath, sidebar }) => [
      "@docusaurus/plugin-content-docs",
      {
        id,
        path: `processed-docs/${source}`,
        routeBasePath,
        sidebarPath: `./${sidebar}`,
        editUrl: (params) =>
          `https://github.com/AztecProtocol/aztec-packages/edit/next/docs/${source}/` + params.docPath,
        versions: { current: { label: `${line} dev`, noIndex: true, banner: "unreleased" } },
        remarkPlugins,
        rehypePlugins,
      },
    ]),
    // Participate docs instance - NOT versioned (educational content)
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "participate",
        path: participateDocsPath,
        routeBasePath: "participate",
        sidebarPath: "./sidebars-participate.js",
        editUrl: (params) => {
          return (
            `https://github.com/AztecProtocol/aztec-packages/edit/next/docs/docs-participate/` +
            params.docPath
          );
        },
        // NO versioning - educational content is stable
        remarkPlugins,
        rehypePlugins,
      },
    ],
    // Root pages (index, networks, etc.) - no versioning
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "root",
        path: docsPath,
        routeBasePath: "/",
        sidebarPath: false, // No sidebar for root pages
        remarkPlugins,
        rehypePlugins,
      },
    ],
    [
      "@signalwire/docusaurus-plugin-llms-txt",
      {
        siteTitle: SITE_TITLE,
        siteDescription: SITE_DESCRIPTION,
        // External links belong in the single "## Optional" section that
        // scripts/append_api_docs_to_llms.js writes last, after the API index.
        content: {
          // Emit a .md sibling for every route so agents can fetch clean
          // markdown at PAGE.md. llms-full.txt is assembled from those files by
          // scripts/append_api_docs_to_llms.js, which labels each page with its
          // source URL and section (the plugin's copy carries neither).
          enableMarkdownFiles: true,
          enableLlmsFullTxt: false,
          includeDocs: true,
          includePages: true,
          includeBlog: false,
          // false would keep only lastVersion (the version served at the
          // root), dropping testnet's docs when it runs another version. Every
          // built version is kept instead, each in a section named for the
          // networks that read it; cut versions no network reads are excluded.
          includeVersionedDocs: true,
          beforeDefaultRehypePlugins: [
            require("./src/rehype_drop_hash_links.js"),
            require("./src/rehype_code_blocks.js"),
            [
              require("./src/rehype_api_links.js"),
              {
                dirs: apiReferenceDirs(developerDocs, developerCutVersions)
                  .filter(({ kind }) => kind === "aztec-nr")
                  .map(({ dir }) => dir),
              },
            ],
          ],
          routeRules: [
            ...llmsInstances.flatMap((l) => l.routeRules),
            ...productAreaRules,
          ],
          // The auto-generated API reference (raw static HTML under
          // /aztec-nr-api and markdown under /typescript-api) is not part of
          // Docusaurus's routes. It is surfaced in llms.txt separately by
          // scripts/append_api_docs_to_llms.js, and deliberately kept out of the
          // sitemap, so exclude it here too. Utility routes are excluded for the
          // same reason.
          excludeRoutes: [
            "/search",
            "/**/tags",
            "/**/tags/**",
            "/aztec-nr-api/**",
            "/typescript-api/**",
            ...llmsInstances.flatMap((l) => l.excludeRoutes),
            ...lines.flatMap(({ routeBasePath }) => [`/${routeBasePath}`, `/${routeBasePath}/**`]),
          ],
        },
      },
    ],
    [
      "@docusaurus/plugin-ideal-image",
      {
        quality: 70,
        max: 1030, // max resized image's size.
        min: 640, // min resized image's size. if original is lower, use that size.
        steps: 2, // the max number of images generated between min and max (inclusive)
        disableInDev: false,
      },
    ],
    [
      "./src/plugins/pagefind",
      {
        // The API reference each network's docs version links to, as llms.txt lists it.
        apiDirs: Object.values(developerApiFolders).map((folder) => `aztec-nr-api/${folder}/`),
      },
    ],
  ],
  customFields: {
    organizationId: ORGANIZATION_ID,
    websiteId: WEBSITE_ID,
    // Read by the Aztec.nr API page (src/utils/aztecNrApi.mjs), which cannot import network_docs.js (it needs fs).
    aztecNrApiFolders: Object.fromEntries(developerCutVersions.map((version) => [version, apiReferenceFolder(version)])),
    lineApiFolders: lineApiFolders(developerVersionConfig, [...new Set(lines.map(({ line }) => line))]),
  },
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [
        {
          name: "keywords",
          content:
            "aztec, noir, private smart contracts, unstoppable apps, programmable privacy, zero-knowledge, zk rollup, ethereum l2, decentralized, blockchain",
        },
        { property: "og:site_name", content: SITE_TITLE },
        { property: "og:image:alt", content: OG_IMAGE_ALT },
        { name: "twitter:site", content: "@aztecnetwork" },
        { name: "twitter:image:alt", content: OG_IMAGE_ALT },
      ],
      image: "img/docs-preview-image.png",
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      navbar: {
        logo: {
          alt: "Aztec",
          src: "img/brand/aztec-wordmark-ink.svg",
          srcDark: "img/brand/aztec-wordmark-paper.svg",
          href: "/",
          width: 104,
          height: 24,
        },
        items: [
          // Developer sidebar link (Build)
          {
            type: "docSidebar",
            sidebarId: "sidebar",
            docsPluginId: "developer",
            position: "left",
            label: "Build",
          },
          // Operate portal link (node operators)
          {
            type: "doc",
            docId: "operators/index",
            docsPluginId: "network",
            position: "left",
            label: "Run a Node",
          },
          // Participate section - educational content (non-versioned)
          {
            type: "doc",
            docId: "index",
            docsPluginId: "participate",
            position: "left",
            label: "Participate",
          },
          // Last left item, so it can span the gap before the right group.
          {
            type: "search",
            position: "left",
            className: "navbar-search-center",
          },
          // Unified version dropdown - shows context-aware versions based on current section
          {
            type: "custom-unifiedVersionDropdown",
            position: "right",
          },
          {
            to: "/networks",
            label: "Networks",
            position: "right",
          },
          {
            type: "dropdown",
            label: "Resources",
            position: "right",
            items: [
              {
                type: "html",
                value: '<span class="dropdown-subtitle">GitHub</span>',
                className: "dropdown-subtitle",
              },
              {
                to: "https://github.com/AztecProtocol/aztec-packages",
                label: "Aztec Monorepo",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "github-item",
              },
              {
                to: "https://github.com/aztec-labs-eng/aztec-nr",
                label: "Aztec.nr",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "github-item",
              },
              {
                to: "https://github.com/AztecProtocol/awesome-aztec",
                label: "Awesome Aztec",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "github-item",
              },
              {
                type: "html",
                value: '<span class="dropdown-subtitle">Other Docs</span>',
                className: "dropdown-subtitle",
              },
              {
                to: "/developers/ai_tooling",
                label: "AI Tooling",
                className: "no-external-icon",
              },
              {
                to: "/developers/docs/resources/video_lessons",
                label: "Video Lessons",
                className: "no-external-icon",
              },
              {
                to: "/developers/docs/resources/glossary",
                label: "Glossary",
                className: "no-external-icon",
              },
              {
                to: "/developers/docs/resources/migration_notes",
                label: "Migration Notes",
                className: "no-external-icon",
              },
              {
                to: "/aztec_connect_sunset",
                label: "Aztec Connect Sunset",
                className: "no-external-icon",
              },
              {
                to: "https://noir-lang.org/docs",
                label: "Noir docs",
                target: "_blank",
                rel: "noopener noreferrer",
              },
              {
                type: "html",
                value: '<span class="dropdown-subtitle">Support</span>',
                className: "dropdown-subtitle",
              },
              {
                to: "/developers/support",
                label: "Support",
                className: "no-external-icon",
              },
              {
                to: "https://discord.gg/aztec",
                label: "Discord",
                target: "_blank",
                rel: "noopener noreferrer",
              },
              {
                to: "https://forum.aztec.network",
                label: "Forum",
                target: "_blank",
                rel: "noopener noreferrer",
              },
              {
                to: "https://x.com/aztecnetwork",
                label: "X/Twitter",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "twitter-item",
              },
            ],
          },
        ],
      },
      footer: require("./src/footer.js"),
      prism: {
        theme: themes.nightOwlLight,
        darkTheme: themes.okaidia,
        // https://prismjs.com/#supported-languages
        // Commented-out languages exists in `node_modules/prismjs/components/` so I'm not sure why they don't work.
        additionalLanguages: [
          "diff",
          "rust",
          "solidity",
          "cpp",
          "javascript",
          // "typescript",
          "json",
          // "bash",
          "toml",
          "markdown",
          "docker",
        ],
        magicComments: [
          // Remember to extend the default highlight class name as well!
          {
            className: "theme-code-block-highlighted-line",
            line: "highlight-next-line",
            block: { start: "highlight-start", end: "highlight-end" },
          },
          {
            className: "code-block-error-line",
            line: "this-will-error",
          },
        ],
      },
    }),
};

module.exports = config;
