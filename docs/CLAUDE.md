# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

You are working with the **Aztec Protocol Documentation** - a comprehensive documentation site built with Docusaurus 3 for a privacy-centric zkRollup solution for Ethereum. Your role includes both technical development tasks and ensuring all documentation meets quality standards for accuracy, clarity, and usability.

## Development Commands

### Package Manager

This project uses Yarn 4.5.2 as specified in the `packageManager` field of package.json. Make sure to use Yarn for all dependency management.

### Essential Commands

- `yarn` - Install dependencies
- `yarn dev` - Start development server (defaults to HOST=0.0.0.0 for remote/codespaces access, override with HOST environment variable)
- `yarn build` - Build production site with full validation (includes clean, preprocess, and move steps)
- `yarn serve` - Serve the built static site
- `yarn spellcheck` - Run spell checking with cspell on markdown files
- `yarn clean` - Clean build artifacts and processed docs

### Development Workflow

The documentation uses a **preprocessing system** that:

- Pulls code from source files using `#include_code` macros
- Generates auto-documentation from TypeScript/JavaScript sources
- Processes macros like `#include_aztec_version` and `#include_testnet_version`
- Outputs to `processed-docs/` folder for production builds

For development:

- `yarn preprocess` - Run preprocessing manually (uses dotenv for configuration)
- `yarn preprocess:move` - Move processed docs to final location
- `yarn dev` runs preprocessing once at startup and serves from `processed-docs/` folder
- **Important**: Hot reloading is NOT available - you must restart the dev server to see changes
- Changes to files in the `docs/` folder will NOT be reflected until you restart the dev server

## Documentation Architecture

### Key Directories

- `docs/` - Main documentation source files
- `processed-docs/` - Generated docs for production builds (gitignored)
- `versioned_docs/` - Version-specific documentation copies
- `versioned_sidebars/` - Version-specific sidebar configurations
- `src/preprocess/` - Preprocessing scripts and macro handlers
- `src/components/` - React components for documentation
- `static/img/` - Static images and assets
- `internal_notes/` - Internal documentation notes
- `scripts/` - Build and utility scripts

### Content Structure

- **Developer Guides** (`/developers/`) - Getting started, tutorials, references
- **Aztec Concepts** (`/aztec/`) - Core protocol concepts and architecture
- **Protocol Specs** (`/protocol-specs/`) - Detailed technical specifications
- **Network Guides** (`/the_aztec_network/`) - Node operation and network participation

### Versioning System

Uses Docusaurus versioning with:

- Versions listed in `versions.json`
- `versioned_docs/version-X.X.X/` contains historical versions
- `versioned_sidebars/` contains version-specific sidebar configurations
- Macros (`#include_code`, `#include_aztec_version`, etc.) only work in source `docs/` folder, not in versioned copies
- Version dropdown shows: `Next`, `testnet`, and latest sandbox release versions

## Documentation Review Standards

## Primary Review Objectives

### 1. Grammar & Language

- Fix grammatical errors, typos, and punctuation issues
- Ensure proper sentence structure and paragraph flow
- Correct verb tense consistency (prefer present tense for instructions)
- Fix subject-verb agreement and pronoun references

### 2. Tone & Voice

- Maintain a professional tone
- Use second person "you" perspective for user guides, how-to guides, and tutorials
- Use first person plural "we" perspective for conceptual pages, architectural overviews and explanations
- Keep language inclusive and accessible
- Favor concise, direct language
- Avoid passive voice where possible
- Avoid jargon unless necessary (and define it when used)
- Be encouraging rather than prescriptive ("you can" vs "you must" where appropriate)

### 3. Conciseness

- Remove redundant information
- Combine related short sentences
- Replace wordy phrases with concise alternatives
- Eliminate unnecessary qualifiers and filler words
- Keep paragraphs focused on single concepts

## Technical Review Criteria

### 4. Accuracy & Completeness

- Verify all technical information is correct
- Ensure no critical steps are missing in procedures
- Check that all prerequisites are stated upfront
- Validate command syntax and parameters
- Confirm version numbers and compatibility information

### 5. Code & Examples

- Verify code blocks are syntactically correct
- Ensure proper language tags for syntax highlighting
- Check that examples are practical and runnable
- Include expected output where relevant
- Follow coding best practices for the language

### 6. Structure & Organization

- Confirm logical information flow (simple → complex)
- Verify proper heading hierarchy (H1 → H2 → H3, etc.)
- Ensure consistent use of lists (ordered vs unordered)
- Check that related information is grouped together and that duplicate information is minimized
- Validate all internal links and cross-references

### 7. User Experience

- Include clear action items and expected outcomes
- Provide troubleshooting for common issues
- Add helpful notes, warnings, and tips using appropriate formatting
- Include "Next steps" or "Related topics" where appropriate

## Consistency Standards

### Terminology

Use these terms consistently throughout:

- **[Aztec Protocol]** - Always capitalize and use full name on first mention
- **[PXE]** - Always capitalize and use full name (Private eXecution Environment) on first mention

### Formatting Conventions

- **Code terms**: Use `backticks` for inline code, commands, file names, and technical terms
- **Emphasis**: Use _italics_ sparingly for emphasis
- **File paths**: Always use forward slashes (e.g., `/usr/local/bin`)
- **Placeholders**: Use `[PLACEHOLDER_NAME]` format in examples

### Standard Sections

Every guide should include:

1. **Front-matter** - YAML metadata block with required `description` field
2. **Title** - Clear, descriptive, and action-oriented
3. **Overview** - Brief description of what the guide covers
4. **Prerequisites** - Required knowledge, tools, or access
5. **Steps/Content** - Main body with clear headings
6. **Verification** - How to confirm successful completion
7. **Troubleshooting** - Common issues and solutions (where applicable)
8. **Next Steps** - Related guides or advanced topics

### Front-matter Requirements

Every markdown file MUST include front-matter with a `description` field:

```yaml
---
title: "Page Title"
description: "Brief, SEO-friendly description of the page content (50-160 characters recommended)"
---
```

The description should:

- Clearly summarize the page's purpose and content
- Be between 50-160 characters for optimal SEO
- Use active voice and be user-focused
- Avoid redundancy with the page title
- Help users understand what they'll learn or accomplish

## Special Instructions

### Do Review For:

- ✅ Missing front-matter or missing `description` field in front-matter
- ✅ Ambiguous instructions that could confuse users
- ✅ Missing context or assumptions about user knowledge
- ✅ Outdated screenshots or version references
- ✅ Broken markdown formatting
- ✅ Inconsistent capitalization in headings
- ✅ Missing alt text for images
- ✅ Security implications of commands or configurations

### Do NOT Change:

- ❌ Product-specific command names or parameters
- ❌ Intentionally simplified examples for beginners
- ❌ Legal disclaimers or license text
- ❌ Direct quotes from external sources
- ❌ API endpoint URLs or configuration values

## Review Output Format

When reviewing, provide feedback in this format:

1. **Summary**: Brief overview of the document's current state
2. **Critical Issues**: Must-fix problems affecting accuracy or usability
3. **Improvements**: Suggested enhancements for clarity and consistency
4. **Positive Aspects**: What's working well (to maintain in future edits)

For inline edits, use clear markers:

- `[GRAMMAR]` - Grammar or spelling fix
- `[CLARITY]` - Rewrite for better understanding
- `[TECHNICAL]` - Technical accuracy correction
- `[STYLE]` - Style guide compliance
- `[STRUCTURE]` - Organization improvement

## Project-Specific Guidelines

### Domain Context

- **Industry**: Blockchain, Smart Contracts, Privacy, zero-knowledge, rollups on Ethereum
- **Primary Users**: Smart contract developers, protocol engineers, protocol researchers
- **Documentation Type**: Explainer docs, how-to guides, reference docs, API docs, tutorials

### Version Management

- Current versions: see `./versions.json`
- Version notation format: **vX.X.X** (e.g., v0.86.0)

### External References

Approved external documentation sources:

- Noir: https://noir-lang.org/docs

### Spell Checking Configuration

- Uses cspell with custom dictionary at `docs-words.txt`
- Checks files in `docs/`, `versioned_docs/`, `internal_notes/`, and snippet components
- Ignores `node_modules`, `processed-docs`, `processed-docs-cache`
- Imports additional configuration from `../cspell.json`

---

## Notes for Claude

- Prioritize clarity and user success over strict style adherence
- When in doubt, favor explicit over implicit information
- Consider the user's journey through the entire documentation site
- Flag any content that might need subject matter expert review
- Suggest improvements even if they go beyond pure editing

Last updated: 2025-15-08
Version: 1.1
