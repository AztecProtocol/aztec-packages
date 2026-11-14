# Contributing to the docs

Thanks for considering contributing to the Aztec documentation site! This document contains a set of guidelines for contributing to the documentation. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

All contributors and participants will follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

How the site is built, its commands and its checks: [README.md](./README.md). The rules every change follows: [CLAUDE.md](./CLAUDE.md).

## I have a question

This repo is not for asking general questions, so don't open issues with questions. 

If you have a question about Aztec, consult the live documentation site at [https://docs.aztec.network](https://docs.aztec.network), or join the [Discord server](https://discord.com/invite/aztec) and ask the community.

If you have a question about contributing to the docs, ask in the [Discord server](https://discord.com/invite/aztec). To report a mistake in the docs, open an [issue](https://github.com/AztecProtocol/aztec-packages/issues).

## Docusaurus

This site is built using [Docusaurus](https://docusaurus.io/docs).

> 🧐 Docusaurus is a static-site generator. It builds a single-page application with fast client-side navigation, leveraging the full power of React to make your site interactive. It provides out-of-the-box documentation features but can be used to create any kind of site (personal website, product, blog, marketing landing pages, etc).

If you have questions about how Docusaurus works, consult their [documentation](https://docusaurus.io/docs) before you contribute.

## Creating pages

Write pages in markdown. [Docusaurus reference](https://docusaurus.io/docs/creating-pages#add-a-markdown-page).

A new developer page under `docs-developers/docs/` appears in the sidebar from its folder (`sidebars-developer.js`). A new operator page must be added to `sidebars-operate.js`, and a participation page to `sidebars-participate.js`. Developer and operator pages exist once per dev line: add yours to each (see [CLAUDE.md](./CLAUDE.md)).

### Front-matter

Markdown front matter includes a title and a description.

```md
---
title: Page title
description: What the reader learns or does on this page, in 50 to 160 characters.
---
```

### Adding images

Pages are parsed as [MDX](https://mdxjs.com/), so a `.md` page can import components.

Import [Ideal image](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-ideal-image) to the page.

```ts
import Image from '@theme/IdealImage';
```

Add the image with the path to the image in `./static/img/`.

```ts
<Image img={require('/img/flamegraph-counter.png')} />
```

Things to note:

- To change the sidebar tree, edit the section's `sidebars-*.js`. Consult [these docs](https://docusaurus.io/docs/sidebar) for reference.
- The search on the Docusaurus documentation site is excellent. Try searching for the topic in question.

When in doubt, check existing sections of the code to see if there are relevant references.

## Structuring the docs

Aztec's docs are structured in accordance to a few smart people's philosophies about documentation. You can read the guidelines into how we write docs [here](./HOW_WE_WRITE_DOCS.md).

### Citations

The following documents were referenced in the creation of this doc.

- [Contributing to Atom](https://github.com/atom/atom/blob/master/CONTRIBUTING.md)
