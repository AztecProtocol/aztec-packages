#!/usr/bin/env node
/**
 * Merge TypeDoc markdown output into a single file
 *
 * Usage: node merge_typedoc.js <input-dir> <output-file>
 */

const fs = require('fs');
const path = require('path');

function getAllMarkdownFiles(dir) {
  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f))
    .sort();
}

function parseModulePath(filename) {
  // Parse filename like: account.account.Class.BaseAccount.md
  // Extract: module = account.account, type = Class, name = BaseAccount
  const basename = path.basename(filename, '.md');
  const parts = basename.split('.');

  if (parts.length < 2) {
    return { module: 'root', type: '', name: basename, isIndex: true };
  }

  // Check if it's a module index (e.g., account.account.md)
  if (parts.length === 2) {
    return {
      module: parts.join('.'),
      type: '',
      name: '',
      isIndex: true
    };
  }

  // It's a specific export (e.g., account.account.Class.BaseAccount)
  const name = parts.pop();
  const type = parts.pop();
  const module = parts.join('.');

  return { module, type, name, isIndex: false };
}

function escapeMDXCurlyBraces(text) {
  // Escape curly braces for MDX, but only outside of code blocks
  // and only if not already escaped
  let inCodeBlock = false;
  let inInlineCode = false;
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next2 = text.substring(i, i + 3);
    const prev = text[i - 1];

    // Check for triple backtick code blocks
    if (next2 === '```') {
      inCodeBlock = !inCodeBlock;
      result += next2;
      i += 2;
      continue;
    }

    // Check for inline code (single backtick)
    if (char === '`' && prev !== '\\') {
      inInlineCode = !inInlineCode;
      result += char;
      continue;
    }

    // Escape curly braces only outside code blocks/inline code
    // and only if not already escaped
    if (!inCodeBlock && !inInlineCode) {
      // Check if already escaped (preceded by backslash)
      if (char === '{' && prev !== '\\') {
        result += '\\{';
        continue;
      }
      if (char === '}' && prev !== '\\') {
        result += '\\}';
        continue;
      }
    }

    result += char;
  }

  return result;
}

function fixInternalLinks(text) {
  // Convert TypeDoc internal file links to anchor links
  // Pattern: [text](module.submodule.Type.Name.md) -> [text](#module-submodule-name)
  // Pattern: [text](module.submodule.Type.Name.md#anchor) -> [text](#module-submodule-name-anchor)
  return text.replace(/\]\(([a-z0-9_\-\.]+\.md)(#[a-z0-9_\-]+)?\)/gi, (match, filename, hash) => {
    // Remove .md extension
    let anchor = filename.replace(/\.md$/i, '');

    // Remove type prefixes (Class., Interface., TypeAlias., Function., Variable.)
    anchor = anchor.replace(/\.(Class|Interface|TypeAlias|Function|Variable)\./g, '.');

    // Convert to lowercase and replace dots/underscores with hyphens
    anchor = anchor.toLowerCase().replace(/[._]/g, '-');

    // If there was a hash anchor, append it (without the # since we'll add it back)
    if (hash) {
      anchor += hash.substring(1); // Remove the # and append
    }

    return `](#${anchor})`;
  });
}

function cleanContent(content, info) {
  // Remove the header line that TypeDoc adds
  let cleaned = content;

  // Remove "**Aztec.js API Reference**" header if present
  cleaned = cleaned.replace(/^\*\*Aztec\.js API Reference\*\*\n\n\*\*\*\n\n/m, '');

  // Remove breadcrumb navigation
  cleaned = cleaned.replace(/\[Aztec\.js API Reference\]\([^\)]+\).*?\n\n/g, '');

  // For non-index files, adjust heading levels
  if (!info.isIndex) {
    // Change "# Class: BaseAccount" to "### BaseAccount"
    // First line is typically the main heading
    const lines = cleaned.split('\n');
    if (lines[0].startsWith('# ')) {
      // Extract just the name (e.g., "Class: BaseAccount" -> "BaseAccount")
      const title = lines[0].substring(2);
      const nameMatch = title.match(/(?:Class|Interface|Type Alias|Function|Variable):\s*(.+)/);
      if (nameMatch) {
        lines[0] = `### ${nameMatch[1]}`;
      } else {
        lines[0] = `### ${title}`;
      }
    }
    cleaned = lines.join('\n');

    // Adjust all other headings down by 2 levels (## -> ####, ### -> #####, etc.)
    cleaned = cleaned.replace(/\n## /g, '\n#### ');
    cleaned = cleaned.replace(/\n### /g, '\n##### ');
    cleaned = cleaned.replace(/\n#### /g, '\n###### ');
  }

  // Fix internal links to work with single-file format
  cleaned = fixInternalLinks(cleaned);

  // Escape curly braces for MDX compatibility
  cleaned = escapeMDXCurlyBraces(cleaned);

  return cleaned.trim();
}

function organizeByModule(files) {
  const modules = new Map();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const info = parseModulePath(file);

    if (!modules.has(info.module)) {
      modules.set(info.module, {
        name: info.module,
        displayName: info.module.split('.').map(s =>
          s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
        ).join(' / '),
        index: null,
        exports: []
      });
    }

    const moduleData = modules.get(info.module);
    const cleanedContent = cleanContent(content, info);

    if (info.isIndex) {
      moduleData.index = cleanedContent;
    } else {
      moduleData.exports.push({
        type: info.type,
        name: info.name,
        content: cleanedContent,
        sortKey: `${info.type}-${info.name}`
      });
    }
  }

  // Sort exports within each module
  for (const [_, moduleData] of modules) {
    moduleData.exports.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  return modules;
}

function generateTOC(modules) {
  const lines = ['## Table of Contents\n'];

  for (const [_, moduleData] of modules) {
    if (moduleData.name === 'root') continue;

    const anchor = moduleData.name.toLowerCase().replace(/\./g, '-').replace(/_/g, '-');
    lines.push(`- [${moduleData.displayName}](#${anchor})`);

    for (const exp of moduleData.exports) {
      const expAnchor = `${anchor}-${exp.name.toLowerCase()}`;
      lines.push(`  - [${exp.name}](#${expAnchor})`);
    }
  }

  return lines.join('\n') + '\n';
}

function mergeModules(modules) {
  const sections = [];

  // Add header
  sections.push('# Aztec.js API Reference');
  sections.push('');
  sections.push('*Package: @aztec/aztec.js*');
  sections.push('');
  sections.push(`*Generated: ${new Date().toISOString()}*`);
  sections.push('');
  sections.push('This document provides a comprehensive reference for all public APIs in the Aztec.js library.');
  sections.push('');
  sections.push('Each section is organized by module, with classes, interfaces, types, and functions documented with their full signatures, parameters, and return types.');
  sections.push('');

  // Add TOC
  sections.push(generateTOC(modules));
  sections.push('---\n');

  // Add module content
  for (const [_, moduleData] of modules) {
    if (moduleData.name === 'root') continue;

    sections.push(`## ${moduleData.displayName}\n`);

    // Add module index content if available
    if (moduleData.index) {
      sections.push(moduleData.index);
      sections.push('');
    }

    sections.push('---\n');

    // Add exports
    for (const exp of moduleData.exports) {
      sections.push(exp.content);
      sections.push('\n');
    }
  }

  return sections.join('\n');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node merge_typedoc.js <input-dir> <output-file>');
    process.exit(1);
  }

  const [inputDir, outputFile] = args;

  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  console.log('Collecting markdown files...');
  const files = getAllMarkdownFiles(inputDir);
  console.log(`Found ${files.length} markdown files`);

  console.log('Organizing by module...');
  const modules = organizeByModule(files);
  console.log(`Organized into ${modules.size} modules`);

  console.log('Merging content...');
  const merged = mergeModules(modules);

  console.log(`Writing to ${outputFile}...`);
  fs.writeFileSync(outputFile, merged, 'utf-8');

  console.log('✓ Done!');
  console.log(`Output: ${outputFile}`);
  console.log(`Size: ${(merged.length / 1024).toFixed(2)} KB`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = { getAllMarkdownFiles, organizeByModule, mergeModules };
