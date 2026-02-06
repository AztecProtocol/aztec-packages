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

// Load separate version files for each docs instance
const developerVersions = require("./developer_versions.json");
const networkVersions = require("./network_versions.json");

// Find specific versions dynamically for Developer docs
const nightlyVersion = developerVersions.find((v) => v.includes("nightly"));
const devnetVersion = developerVersions.find((v) => v.includes("devnet"));

// Find specific versions dynamically for Network docs
const ignitionVersion = networkVersions.find((v) => v.includes("ignition"));
const testnetVersion = networkVersions.find((v) => !v.includes("ignition"));

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
    // Developer docs instance - nightly/devnet versions
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
        lastVersion: devnetVersion,
        versions: {
          ...(devnetVersion && {
            [devnetVersion]: {
              label: `Devnet (${devnetVersion})`,
              path: "",
              banner: "none",
            },
          }),
          ...(nightlyVersion && {
            [nightlyVersion]: {
              path: "nightly",
              banner: "unreleased",
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
    // Operate docs instance (node operators) - testnet/ignition versions
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
        lastVersion: process.env.CONTEXT !== "production" ? "current" : ignitionVersion,
        versions: {
          ...(ignitionVersion && {
            [ignitionVersion]: {
              label: `Ignition (${ignitionVersion.replace("-ignition", "")})`,
              path: process.env.CONTEXT !== "production" ? "ignition" : "",
              banner: "none",
            },
          }),
          ...(testnetVersion && {
            [testnetVersion]: {
              label: `Testnet (${testnetVersion})`,
              path: "testnet",
              banner: "none",
            },
          }),
          ...(process.env.CONTEXT !== "production" && {
            current: {
              label: "dev",
              path: "", // Default path during development
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
      "docusaurus-plugin-llms",
      {
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        docsDir: devnetVersion
          ? `developer_versioned_docs/version-${devnetVersion}/`
          : `developer_versioned_docs/version-${developerVersions[0]}/`,
        title: "Aztec Protocol Documentation",
        excludeImports: true,
        version: devnetVersion || developerVersions[0],
        pathTransformation: {
          ignorePaths: ["docs"],
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
          // Participate section - educational content (non-versioned)
          {
            type: "doc",
            docId: "index",
            docsPluginId: "participate",
            position: "left",
            label: "Participate",
          },
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
                to: "https://airtable.com/appMhZd7lsZS3v27R/pagxWYAHYYrnrrXmm/form",
                label: "Join community",
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
          // This could be used to have release-please modify the current version in code blocks.
          // However doing so requires to manually add each md file to release-please-config.json/extra-files
          // which is easy to forget an error prone, so instead we rely on the AztecPackagesVersion() function.
          {
            line: "x-release-please-version",
            block: {
              start: "x-release-please-start-version",
              end: "x-release-please-end",
            },
            className: "not-allowed-to-be-empty",
          },
        ],
      },
    }),
};

module.exports = config;
