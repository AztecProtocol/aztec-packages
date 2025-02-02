const fs = require('fs');
const path = require('path');

/**
 * Parser for Rust-style documentation in Noir
 * Supports the following tags:
 * #[doc = "..."] - main documentation
 * #[deprecated] - deprecation notice
 * #[example] - usage examples
 * Also maintains support for docs:start and docs:end
 */
class NoirDocParser {
    constructor() {
        this.docs = new Map();
    }

    parseFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        let currentDoc = [];
        let currentExamples = [];
        let isDeprecated = false;
        let isInDocsBlock = false;
        let currentImpl = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Support for existing docs:start and docs:end
            if (line.includes('docs:start:')) {
                isInDocsBlock = true;
                continue;
            }

            if (line.includes('docs:end:')) {
                isInDocsBlock = false;
                continue;
            }

            // Support for Rust-style documentation
            if (line.startsWith('#[doc = ')) {
                const docContent = line.match(/#\[doc = "(.*?)"\]/)[1];
                currentDoc.push(docContent);
            } else if (line.startsWith('#[example = ')) {
                const example = line.match(/#\[example = "(.*?)"\]/)[1];
                currentExamples.push(example);
            } else if (line.startsWith('#[deprecated]')) {
                isDeprecated = true;
            } else if (line.startsWith('impl')) {
                const implMatch = line.match(/impl\s+(\w+)/);
                if (implMatch) {
                    currentImpl = implMatch[1];
                }
            } else if (line.startsWith('pub fn') || line.startsWith('fn') ||
                      line.startsWith('pub struct') || line.startsWith('struct')) {
                // Parse function or struct
                const item = this.parseItem(line, {
                    documentation: currentDoc.join('\n'),
                    examples: currentExamples,
                    isDeprecated,
                    implBlock: currentImpl
                });
                if (item) {
                    const key = currentImpl ? `${currentImpl}::${item.name}` : item.name;
                    this.docs.set(key, item);
                }
                currentDoc = [];
                currentExamples = [];
                isDeprecated = false;
            }
        }

        return this.docs;
    }

    parseItem(line, metadata) {
        if (line.includes('fn')) {
            return this.parseFunction(line, metadata);
        } else if (line.includes('struct')) {
            return this.parseStruct(line, metadata);
        }
        return null;
    }

    parseFunction(line, metadata) {
        const fnMatch = line.match(/(?:pub\s+)?fn\s+(\w+)(?:<.*?>)?\s*\((.*?)\)(?:\s*->\s*(.*?))?/);
        if (!fnMatch) return null;

        return {
            type: 'function',
            name: fnMatch[1],
            params: this.parseParameters(fnMatch[2]),
            returnType: fnMatch[3] || 'void',
            ...metadata
        };
    }

    parseStruct(line, metadata) {
        const structMatch = line.match(/(?:pub\s+)?struct\s+(\w+)/);
        if (!structMatch) return null;

        // Read the struct body to parse fields
        const structBody = this.readStructBody(line);
        const fields = this.parseStructFields(structBody);

        return {
            type: 'struct',
            name: structMatch[1],
            fields,
            ...metadata
        };
    }

    readStructBody(line) {
        const start = line.indexOf('{');
        if (start === -1) return '';

        let depth = 1;
        let body = '';
        let i = start + 1;

        while (depth > 0 && i < line.length) {
            if (line[i] === '{') depth++;
            if (line[i] === '}') depth--;
            if (depth > 0) body += line[i];
            i++;
        }

        return body;
    }

    parseStructFields(body) {
        if (!body) return [];

        const fields = [];
        const fieldLines = body.split(',').map(f => f.trim()).filter(f => f);

        let currentDoc = '';

        for (const line of fieldLines) {
            if (line.startsWith('#[doc = ')) {
                const docMatch = line.match(/#\[doc = "(.*?)"\]/);
                if (docMatch) {
                    currentDoc = docMatch[1];
                }
                continue;
            }

            const [name, type] = line.split(':').map(p => p.trim());
            if (name && type) {
                fields.push({
                    name,
                    type,
                    documentation: currentDoc
                });
                currentDoc = '';
            }
        }

        return fields;
    }

    parseParameters(params) {
        if (!params.trim()) return [];

        return params.split(',').map(param => {
            const [name, type] = param.trim().split(':').map(p => p.trim());
            return { name, type };
        });
    }

    generateMarkdown() {
        let markdown = '# Noir API Documentation\n\n';

        // Group items by type and impl block
        const structs = new Map();
        const impls = new Map();
        const functions = new Map();

        for (const [key, item] of this.docs.entries()) {
            if (item.type === 'struct') {
                structs.set(key, item);
            } else if (item.implBlock) {
                if (!impls.has(item.implBlock)) {
                    impls.set(item.implBlock, new Map());
                }
                impls.get(item.implBlock).set(key, item);
            } else {
                functions.set(key, item);
            }
        }

        // Generate structs documentation
        for (const struct of structs.values()) {
            markdown += this.generateStructMarkdown(struct);

            // Add impl methods right after the struct
            if (impls.has(struct.name)) {
                markdown += `\n### Methods\n\n`;
                for (const method of impls.get(struct.name).values()) {
                    markdown += this.generateMethodMarkdown(method);
                }
            }
        }

        // Generate standalone functions
        if (functions.size > 0) {
            markdown += `\n## Functions\n\n`;
            for (const func of functions.values()) {
                markdown += this.generateFunctionMarkdown(func);
            }
        }

        return markdown;
    }

    generateItemMarkdown(item) {
        if (item.type === 'function') {
            return this.generateFunctionMarkdown(item);
        } else {
            return this.generateStructMarkdown(item);
        }
    }

    generateFunctionMarkdown(func) {
        let md = `## Function \`${func.name}\`\n\n`;

        if (func.isDeprecated) {
            md += '> **Warning:** This function is deprecated.\n\n';
        }

        if (func.documentation) {
            md += `${func.documentation}\n\n`;
        }

        if (func.examples && func.examples.length > 0) {
            md += '### Examples\n\n';
            func.examples.forEach(example => {
                md += '```noir\n' + example + '\n```\n\n';
            });
        }

        md += '### Signature\n\n```noir\n';
        const params = func.params.map(p => `${p.name}: ${p.type}`).join(', ');
        md += `fn ${func.name}(${params}) -> ${func.returnType}\n\`\`\`\n\n`;

        if (func.params.length > 0) {
            md += '### Parameters\n\n';
            md += '| Name | Type | Description |\n|------|------|-------------|\n';
            func.params.forEach(param => {
                md += `| \`${param.name}\` | \`${param.type}\` | |\n`;
            });
            md += '\n';
        }

        return md;
    }

    generateStructMarkdown(struct) {
        let md = `## Struct \`${struct.name}\`\n\n`;

        if (struct.isDeprecated) {
            md += '> **Warning:** This struct is deprecated.\n\n';
        }

        if (struct.documentation) {
            md += `${struct.documentation}\n\n`;
        }

        if (struct.examples && struct.examples.length > 0) {
            md += '### Examples\n\n';
            struct.examples.forEach(example => {
                md += '```noir\n' + example + '\n```\n\n';
            });
        }

        if (struct.fields && struct.fields.length > 0) {
            md += '### Fields\n\n';
            md += '| Name | Type | Description |\n|------|------|-------------|\n';
            struct.fields.forEach(field => {
                md += `| \`${field.name}\` | \`${field.type}\` | ${field.documentation || ''} |\n`;
            });
            md += '\n';
        }

        return md;
    }

    generateMethodMarkdown(method) {
        let md = `#### \`${method.name}\`\n\n`;

        if (method.isDeprecated) {
            md += '> **Warning:** This method is deprecated.\n\n';
        }

        if (method.documentation) {
            md += `${method.documentation}\n\n`;
        }

        if (method.examples && method.examples.length > 0) {
            md += '##### Examples\n\n';
            method.examples.forEach(example => {
                md += '```noir\n' + example + '\n```\n\n';
            });
        }

        md += '##### Signature\n\n```noir\n';
        const params = method.params.map(p => `${p.name}: ${p.type}`).join(', ');
        md += `fn ${method.name}(${params}) -> ${method.returnType}\n\`\`\`\n\n`;

        if (method.params.length > 0) {
            md += '##### Parameters\n\n';
            md += '| Name | Type | Description |\n|------|------|-------------|\n';
            method.params.forEach(param => {
                md += `| \`${param.name}\` | \`${param.type}\` | |\n`;
            });
            md += '\n';
        }

        return md;
    }
}

module.exports = NoirDocParser;
