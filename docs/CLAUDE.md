# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

You are working with the **Aztec Protocol Documentation** - a comprehensive documentation site built with Docusaurus 3 for a privacy-centric zkRollup solution for Ethereum. Your role includes both technical development tasks and ensuring all documentation meets quality standards for accuracy, clarity, and usability.

## Development Commands

### Essential Commands

- `yarn` - Install dependencies
- `yarn dev` - Start development server with hot reload (remote/codespaces)
- `yarn dev:local` - Start development server (localhost only)
- `yarn build` - Build production site with full validation
- `yarn build:with-specs` - Build with protocol specifications included
- `yarn spellcheck` - Run spell checking with cspell
- `yarn clean` - Clean build artifacts and processed docs

### Development Workflow

The documentation uses a **preprocessing system** that:

- Pulls code from source files using `#include_code` macros
- Generates auto-documentation from TypeScript/JavaScript sources
- Processes macros like `#include_aztec_version` and `#include_testnet_version`
- Outputs to `processed-docs/` folder for production builds

For development:

- `yarn preprocess` - Run preprocessing once
- `yarn preprocess:dev` - Watch mode for preprocessing
- In development mode (`ENV=dev`), Docusaurus serves from `docs/` folder directly
- For production builds, it serves from `processed-docs/`

## Documentation Architecture

### Key Directories

- `docs/` - Main documentation source files
- `processed-docs/` - Generated docs for production builds
- `versioned_docs/` - Version-specific documentation copies
- `src/preprocess/` - Preprocessing scripts and macro handlers
- `src/components/` - React components for documentation
- `static/img/` - Static images and assets

### Content Structure

- **Developer Guides** (`/developers/`) - Getting started, tutorials, references
- **Aztec Concepts** (`/aztec/`) - Core protocol concepts and architecture
- **Protocol Specs** (`/protocol-specs/`) - Detailed technical specifications
- **Network Guides** (`/the_aztec_network/`) - Node operation and network participation

### Versioning System

Uses Docusaurus versioning with:

- Current version defined in `versions.json` (currently `v1.2.0`)
- `versioned_docs/version-X.X.X/` contains historical versions
- Macros only work in source `docs/` folder, not in versioned copies

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

1. **Title** - Clear, descriptive, and action-oriented
2. **Overview** - Brief description of what the guide covers
3. **Prerequisites** - Required knowledge, tools, or access
4. **Steps/Content** - Main body with clear headings
5. **Verification** - How to confirm successful completion
6. **Troubleshooting** - Common issues and solutions (where applicable)
7. **Next Steps** - Related guides or advanced topics

## Special Instructions

### Do Review For:

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

- Current version: see ./versions.json
- Version notation format: **v1.2.1**

### External References

Approved external documentation sources:

- Noir: https://noir-lang.org/docs

---

## Notes for Claude

- Prioritize clarity and user success over strict style adherence
- When in doubt, favor explicit over implicit information
- Consider the user's journey through the entire documentation site
- Flag any content that might need subject matter expert review
- Suggest improvements even if they go beyond pure editing

Last updated: 2025-08-08
Version: 1.0
