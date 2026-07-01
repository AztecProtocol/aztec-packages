// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require("prism-react-renderer");
// @ts-ignore
const lightTheme = themes.github;
// @ts-ignore
const darkTheme = themes.dracula;

// @ts-ignore
import math from "remark-math";
// @ts-ignore
import katex from "rehype-katex";

// @ts-ignore
const path = require("path");
// @ts-ignore
const fs = require("fs");
const macros = require("./src/katex-macros.js");

// Version config files are the source of truth for type→version mappings.
// Generate *_versions.json: config-mapped versions first (preserving config order),
// then any extra directories not yet in the config (e.g. freshly cut versions).
function syncVersionsFromConfig(configFile, versionsFile, versionedDocsDir) {
  const config = require(configFile);
  const docsDir = path.join(__dirname, versionedDocsDir);
  const configVersions = [
    ...new Set(
      Object.values(config).filter(
        (v) => v && fs.existsSync(path.join(docsDir, `version-${v}`))
      )
    ),
  ];
  const configVersionSet = new Set(Object.values(config).filter(Boolean));
  const extraVersions = fs.existsSync(docsDir)
    ? fs
        .readdirSync(docsDir)
        .filter((d) => d.startsWith("version-"))
        .map((d) => d.replace("version-", ""))
        .filter((v) => !configVersionSet.has(v))
    : [];
  fs.writeFileSync(
    path.join(__dirname, versionsFile),
    JSON.stringify([...configVersions, ...extraVersions], null, 2) + "\n"
  );
  return config;
}

const developerVersionConfig = syncVersionsFromConfig(
  "./developer_version_config.json",
  "developer_versions.json",
  "developer_versioned_docs"
);
const mainnetDeveloperVersion = developerVersionConfig.mainnet || null;
const developerTestnetVersion = developerVersionConfig.testnet || null;

const networkVersionConfig = syncVersionsFromConfig(
  "./network_version_config.json",
  "network_versions.json",
  "network_versioned_docs"
);
const mainnetNetworkVersion = networkVersionConfig.mainnet || null;
const testnetVersion = networkVersionConfig.testnet || null;

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

const config = {
  title: "Privacy-first zkRollup | Aztec Documentation",
  tagline:
    "Aztec introduces a privacy-centric zkRollup solution for Ethereum, enhancing confidentiality and scalability within the Ethereum ecosystem.",
  url: "https://docs.aztec.network/",
  baseUrl: "/",
  trailingSlash: false,
  onBrokenLinks: "throw",
  favicon: "img/Aztec_Symbol_Dark.png",

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
  themes: ["@docusaurus/theme-mermaid", "docusaurus-theme-search-typesense"],
  presets: [
    [
      "@docusaurus/preset-classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        // Disable docs from preset - we use separate plugins for multi-instance
        docs: false,
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
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
  stylesheets: [
    {
      href: "https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css",
      type: "text/css",
      integrity:
        "sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM",
      crossorigin: "anonymous",
    },
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
        lastVersion: mainnetDeveloperVersion || developerTestnetVersion,
        versions: {
          ...(mainnetDeveloperVersion && {
            [mainnetDeveloperVersion]: {
              label:
                mainnetDeveloperVersion === developerTestnetVersion
                  ? `Alpha / Testnet (${mainnetDeveloperVersion})`
                  : `Alpha (${mainnetDeveloperVersion})`,
              path: "",
              banner: "none",
            },
          }),
          ...(developerTestnetVersion &&
            developerTestnetVersion !== mainnetDeveloperVersion && {
              [developerTestnetVersion]: {
                label: `Testnet (${developerTestnetVersion})`,
                path: mainnetDeveloperVersion ? "testnet" : "",
                banner: "none",
              },
            }),
          ...(process.env.CONTEXT !== "production" && {
            current: {
              label: "dev",
              path: "dev",
            },
          }),
        },
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
        lastVersion:
          process.env.CONTEXT !== "production"
            ? "current"
            : mainnetNetworkVersion,
        versions: {
          ...(mainnetNetworkVersion && {
            [mainnetNetworkVersion]: {
              label:
                mainnetNetworkVersion === testnetVersion
                  ? `Alpha / Testnet (${mainnetNetworkVersion})`
                  : `Alpha (${mainnetNetworkVersion})`,
              path: process.env.CONTEXT !== "production" ? "alpha" : "",
              banner: "none",
            },
          }),
          ...(testnetVersion &&
            testnetVersion !== mainnetNetworkVersion && {
              [testnetVersion]: {
                label: `Testnet (${testnetVersion})`,
                path: "testnet",
                banner: "none",
              },
            }),
          ...(process.env.CONTEXT !== "production" && {
            current: {
              label: "dev",
              path: "",
            },
          }),
        },
        remarkPlugins,
        rehypePlugins,
      },
    ],
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
        siteTitle: "Aztec Protocol Documentation",
        siteDescription:
          "Build private smart contracts on Ethereum's leading privacy-first L2 zkRollup.",
        content: {
          // Emit a .md sibling for every route so agents can fetch clean
          // markdown at PAGE.md, and a single-file llms-full.txt dump.
          enableMarkdownFiles: true,
          enableLlmsFullTxt: true,
          includeDocs: true,
          includePages: true,
          includeBlog: false,
          // In production the served docs ARE the versioned snapshots (the
          // current version is excluded), so they must be included or the index
          // covers nothing.
          includeVersionedDocs: true,
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
    // ["./src/plugins/plugin-embed-code", {}],
  ],
  clientModules: ["./src/clientModules/docsgpt.js"],
  customFields: {},
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      metadata: [
        {
          name: "keywords",
          content: "aztec, noir, privacy, encrypted, ethereum, blockchain",
        },
      ],
      image: "img/docs-preview-image.png",
      typesense: {
        typesenseCollectionName: "aztec-docs",
        typesenseServerConfig: {
          nodes: [
            {
              host: "cpk69vuom0ilr4abp.a1.typesense.net",
              port: 443,
              protocol: "https",
            },
          ],
          apiKey: "gpH8o2YnqsOEj2jgtIMTULbtHi1kZ2X3", // public search-only api key, safe to commit
        },
        // aztec-nr-api pages live in /static/ as raw HTML, not React Router
        // routes. Without this, the dropdown calls history.push() and the SPA
        // 404s on click. Matching the regex makes the theme use
        // window.location.href for a real page load that Netlify resolves.
        externalUrlRegex: "/aztec-nr-api/",
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      navbar: {
        logo: {
          alt: "Aztec Logo",
          srcDark: "img/Aztec Wordmark_Light.svg",
          href: "/",
          src: "img/Aztec Wordmark_Dark.svg",
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
            label: "Operate",
          },
          // Participate section - educational content (non-versioned)
          {
            type: "doc",
            docId: "index",
            docsPluginId: "participate",
            position: "left",
            label: "Participate",
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
                to: "https://github.com/AztecProtocol/aztec-starter",
                label: "Aztec Starter repo",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "github-item",
              },
              {
                to: "https://github.com/AztecProtocol/aztec-packages",
                label: "Aztec Monorepo",
                target: "_blank",
                rel: "noopener noreferrer",
                className: "github-item",
              },
              {
                to: "https://github.com/AztecProtocol/aztec-nr",
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
      footer: {
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
                to: "https://github.com/AztecProtocol/aztec-nr",
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
      },
      prism: {
        theme: themes.nightOwlLight,
        darkTheme: themes.shadesOfPurple,
        // darkTheme: themes.dracula,
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
