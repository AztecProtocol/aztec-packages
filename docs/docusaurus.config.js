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
const versions = require("./versions.json");

const config = {
  title: "Privacy-first zkRollup | Aztec Documentation",
  tagline:
    "Aztec introduces a privacy-centric zkRollup solution for Ethereum, enhancing confidentiality and scalability within the Ethereum ecosystem.",
  url: "https://docs.aztec.network/",
  baseUrl: "/",
  trailingSlash: false,
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: process.env.ENV === "dev" ? "warn" : "throw",
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
  },
  themes: ["@docusaurus/theme-mermaid", "docusaurus-theme-search-typesense"],
  presets: [
    [
      "@docusaurus/preset-classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          path: process.env.ENV === "dev" ? "docs" : "processed-docs",
          sidebarPath: "./sidebars.js",
          editUrl: (params) => {
            return (
              `https://github.com/AztecProtocol/aztec-packages/edit/master/docs/docs/` +
              params.docPath
            );
          },
          routeBasePath: "/",
          include: ["**/*.{md,mdx}"],
          exclude: ["protocol-specs/**"],
          // Don't show latest since nightlies are published
          includeCurrentVersion: process.env.ENV === "dev",
          // There should be 2 versions, nightly and stable
          // The stable version is second in the list
          lastVersion: versions[1],
          versions: {
            [versions[0]]: {
              ...(versions[0].includes("nightly") && { path: "nightly" }),
            },
            ...(process.env.ENV === "dev" && {
              current: {
                label: "dev",
                path: "dev",
              },
            }),
          },
          remarkPlugins: [math],
          rehypePlugins: [
            [
              katex,
              {
                throwOnError: true,
                globalGroup: true,
                macros,
              },
            ],
          ],
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
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
    [
      "docusaurus-plugin-llms",
      {
        generateLLMsTxt: true,
        generateLLMsFullTxt: true,
        docsDir: `versioned_docs/version-${versions[0]}/`,
        title: "Aztec Protocol Documentation",
        excludeImports: true,
        ignoreFiles: [`versioned_docs/**/protocol-specs/*`],
        version: versions[0],
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
  customFields: {
    ENV: process.env.ENV,
  },
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
          {
            type: "docsVersionDropdown",
            position: "left",
            dropdownActiveClassDisabled: true,
          },
          {
            type: "docSidebar",
            sidebarId: "sidebar",
            position: "left",
            label: "Build",
          },
          {
            type: "docSidebar",
            sidebarId: "nodesSidebar",
            position: "left",
            label: "Run a node",
          },
          {
            to: "/developers/getting_started_on_sandbox",
            label: "Install Sandbox",
            position: "right",
          },
          {
            to: "/try_testnet",
            label: "Try Testnet",
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
                to: "/developers/docs/reference/glossary",
                label: "Glossary",
                className: "no-external-icon",
              },
              {
                to: "/developers/migration_notes",
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
                label: "Developer Getting Started",
                to: "/developers/getting_started",
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
