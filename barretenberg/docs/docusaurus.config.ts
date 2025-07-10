const { themes } = require("prism-react-renderer");
const lightTheme = themes.github;
const darkTheme = themes.dracula;

import math from "remark-math";
import katex from "rehype-katex";
import { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const path = require("path");
const fs = require("fs");
const macros = require("./src/katex-macros.js");
const versions = require("./versions.json");

// To redirect /api to the static/api directory in dev mode (netlify handles it in prod)
function apiPlugin(context: any, options: any) {
  return {
    name: 'api-static-plugin',
    configureWebpack(config: any, isServer: boolean, utils: any) {
      if (!isServer) {
        return {
          mergeStrategy: { 'devServer.setupMiddlewares': 'replace' },
          devServer: {
            setupMiddlewares: (middlewares: any, devServer: any) => {
              const express = require('express');
              devServer.app.use('/api', express.static(path.join(__dirname, 'static/api')));
              return middlewares;
            },
          },
        } as any;
      }
      return {};
    }
  }
}


const config: Config = {
  title: "Barretenberg",
  tagline: "Barretenberg is a fast, private and scalable zk-SNARK library.",
  favicon: "img/icon.svg",

  // Set the production url of your site here
  url: "https://bb.aztec.network",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "AztecProtocol", // Usually your GitHub org/user name.
  projectName: "barretenberg", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  customFields: {
    MATOMO_ENV: process.env.ENV,
  },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          sidebarPath: "./sidebars.ts",
          routeBasePath: "docs",
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
          versions: {
            current: {
              label: "dev"
            },
          },
          editUrl: (params) => {
            return (
              `https://github.com/AztecProtocol/aztec-packages/edit/master/docs/docs/` +
              params.docPath
            );
          },
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      } satisfies Preset.Options,
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
      "@docusaurus/plugin-client-redirects",
      {
        redirects: [
          {
            from: "/",
            to: "/docs",
          },
        ],
      },
    ],

    apiPlugin,

  ],
  themeConfig: {
    metadata: [
      {
        name: "keywords",
        content: "aztec, noir, privacy, encrypted, ethereum, blockchain",
      },
    ],
    image: "img/docs-preview-image.png",
    // typesense: {
    //   typesenseCollectionName: "aztec-docs",
    //   typesenseServerConfig: {
    //     nodes: [
    //       {
    //         host: "cpk69vuom0ilr4abp.a1.typesense.net",
    //         port: 443,
    //         protocol: "https",
    //       },
    //     ],
    //     apiKey: "gpH8o2YnqsOEj2jgtIMTULbtHi1kZ2X3", // public search-only api key, safe to commit
    //   },
    // },
    colorMode: {
      defaultMode: "light",
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    navbar: {
      logo: {
        alt: "Aztec Logo",
        srcDark: "img/logo-light.svg",
        href: "/docs",
        src: "img/logo-dark.svg",
      },
      items: [
        {
          href: "https://github.com/AztecProtocol/aztec-packages/tree/master/barretenberg/docs",
          label: "GitHub",
          position: "right",
        },
        {
          type: "docsVersionDropdown",
          position: "left",
          dropdownActiveClassDisabled: true,
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Community",
          items: [
            {
              label: "Forum",
              href: "https://forum.aztec.network",
            },
            {
              label: "Discord",
              href: "https://discord.com/invite/aztec",
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
              label: "Grants",
              href: "https://aztec.network/grants",
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
  } satisfies Preset.ThemeConfig,
};

export default config;
