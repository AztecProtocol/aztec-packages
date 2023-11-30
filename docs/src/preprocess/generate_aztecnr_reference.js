const fs = require('fs');
const path = require('path');

// const filePath = '../../../yarn-project/aztec-nr/address-note/src/address_note.nr'; 
// const filePath = '../../../yarn-project/aztec-nr/authwit/src/account.nr'; 
// const filePath = '../../../yarn-project/aztec-nr/authwit/src/auth.nr';
// const filePath = '../../../yarn-project/aztec-nr/aztec/src/abi.nr';
// const filePath = '../../../yarn-project/aztec-nr/aztec/src/log.nr';
// const filePath = '../../../yarn-project/aztec-nr/aztec/src/utils.nr'; 
const filePath = '../../../yarn-project/aztec-nr/field-note/src/field_note.nr';

const content = fs.readFileSync(filePath, 'utf8');

function parseParameters(paramString) {
    return paramString.split(',').map(param => {
        param = param.trim().replace(/[\[:;,.]$/g, '').replace(/^[\[:;,.]/g, ''); // Clean up start and end
        let [paramName, type] = param.split(':').map(p => p.trim());
        return { name: paramName, type };
    });
}

function parseStruct(content) {
    const structRegex = /struct (\w+)\s*{([\s\S]*?)}/g;
    let match;
    const structs = [];

    while ((match = structRegex.exec(content)) !== null) {
        const structName = match[1];
        const fields = match[2].trim().split('\n').map(fieldLine => {
            fieldLine = fieldLine.trim().replace(/,$/, '');
            let [name, type] = fieldLine.split(/:\s*/);
            return { name, type };
        });

        let descriptionLines = [];
        let commentIndex = match.index;
        while (commentIndex >= 0) {
            const precedingText = content.substring(0, commentIndex);
            const commentMatch = precedingText.match(/\/\/\s*(.*)\n\s*$/);

            if (commentMatch && !commentMatch[1].includes('docs:start:') && !commentMatch[1].includes('docs:end:')) {
                descriptionLines.unshift(commentMatch[1]);
                commentIndex = commentMatch.index - 1;
            } else {
                break;
            }
        }

        let description = descriptionLines.join(' ');

        structs.push({ structName, fields, description });
    }

    return structs;
}

const structs = parseStruct(content);

function parseFunctions(content) {
    const functions = [];
    const implRegex = /impl\s+(\w+)\s*{/g; // Capture the name of the struct associated with the impl block
    let implMatch;

    while ((implMatch = implRegex.exec(content)) !== null) {
        const structName = implMatch[1]; // Capture the struct name
        let braceDepth = 1;
        let currentPos = implMatch.index + implMatch[0].length;

        // Find the end of the impl block by matching braces
        while (braceDepth > 0 && currentPos < content.length) {
            if (content[currentPos] === '{') {
                braceDepth++;
            } else if (content[currentPos] === '}') {
                braceDepth--;
            }
            currentPos++;
        }

        // Extract the content of the impl block
        const implBlockContent = content.substring(implMatch.index, currentPos);
        const methodRegex = /(?:pub )?fn (\w+)\((.*?)\)(?: -> (.*?))? {/g;
        let methodMatch;

        // Process each method in the impl block
        while ((methodMatch = methodRegex.exec(implBlockContent)) !== null) {
            const name = methodMatch[1];
            const params = parseParameters(methodMatch[2]);
            const returnType = (methodMatch[3] || '').replace(/[\[:;,.]$/g, '').replace(/^[\[:;,.]/g, '');

            // Extracting the comment as description
            let description = '';
            let commentIndex = methodMatch.index;
            while (commentIndex >= 0) {
                const commentMatch = implBlockContent.substring(0, commentIndex).match(/\/\/\s*(.*)\n\s*$/);
                if (commentMatch && !commentMatch[1].includes('docs:start:') && !commentMatch[1].includes('docs:end:')) {
                    description = commentMatch[1] + (description ? ' ' + description : '');
                    commentIndex = commentMatch.index - 1;
                } else {
                    break;
                }
        }

            functions.push({ structName, name, params, returnType, description, isMethod: true });

        }
    }

    // Process standalone functions
    const standaloneFunctionRegex = /(?:pub\s+)?fn\s+(\w+)(?:<.*?>)?\s*\((.*?)\)\s*(?:->\s*(.*?))?\s*{/g;
    let standaloneFunctionMatch;
    while ((standaloneFunctionMatch = standaloneFunctionRegex.exec(content)) !== null) {
        const name = standaloneFunctionMatch[1];

        // Check if this function has already been processed as a method
        if (!functions.some(f => f.name === name)) {
            const params = parseParameters(standaloneFunctionMatch[2]);
            const returnType = (standaloneFunctionMatch[3] || '').replace(/[\[:;,.]$/g, '').replace(/^[\[:;,.]/g, '');

            // Extract the comment as description TODO multiline comments
            let description = '';
            const descriptionMatch = content.substring(0, standaloneFunctionMatch.index).match(/\/\/\s*(.*)\n\s*$/);
            if (descriptionMatch) {
                const precedingText = content.substring(0, descriptionMatch.index);
                if (!precedingText.includes('docs:start:') && !precedingText.includes('docs:end:')) {
                    description = descriptionMatch[1];
                }
            }

            functions.push({ name, params, returnType, description, isMethod: false });
        }
    }

    return functions;
}


const functions = parseFunctions(content);

function generateMarkdown(structInfo, functions) {
    let markdown = '';

    structs.forEach(structInfo => {
        if (structInfo) {
            markdown += `# ${structInfo.structName} Struct\n\n`;

            if (structInfo.description) {
                markdown += `${structInfo.description}\n\n`;
            }

            markdown += `## Fields\n`;
            markdown += `| Field | Type |\n| --- | --- |\n`;
            structInfo.fields.forEach(field => {
                const cleanType = field.type.replace(/[\[:;,]$/g, '').replace(/^[\[:;,]/g, ''); 
                const fieldName = field.name.replace(/[:;]/g, ''); 
                markdown += `| ${fieldName} | ${cleanType} |\n`;
            });

            // Generate markdown for methods of this struct
            const methods = functions.filter(f => f.isMethod && f.structName === structInfo.structName);
            if (methods.length > 0) {
                markdown += `\n## Methods\n\n`;
                methods.forEach(func => {
                    markdown += `### ${func.name}\n\n`;
                    if (func.description) markdown += `${func.description}\n\n`;
                    markdown += `#### Parameters\n`;
                    markdown += `| Name | Type |\n| --- | --- |\n`;
                    func.params.forEach(({ name, type }) => {
                        markdown += `| ${name} | ${type} |\n`;
                    });
                    if (func.returnType) {
                        markdown += `\n#### Returns\n`;
                        markdown += `| Type |\n| --- |\n`;
                        markdown += `| ${func.returnType} |\n`;
                    }
                    markdown += '\n';
                });
            }
        }
    });

    // Generate markdown for standalone functions
    const standaloneFunctions = functions.filter(f => !f.isMethod);
    if (standaloneFunctions.length > 0) {
        markdown += `\n## Standalone Functions\n\n`;
        standaloneFunctions.forEach(func => {
            markdown += `### ${func.name}\n\n`;
            if (func.description) markdown += `${func.description}\n\n`;
            markdown += `#### Parameters\n`;
            markdown += `| Name | Type |\n| --- | --- |\n`;
            func.params.forEach(({ name, type }) => {
                markdown += `| ${name} | ${type} |\n`;
            });
            if (func.returnType) {
                markdown += `\n#### Returns\n`;
                markdown += `| Type |\n| --- |\n`;
                markdown += `| ${func.returnType} |\n`;
            }
            markdown += '\n';
        });
    }

    return markdown;
}

const markdown = generateMarkdown(structs, functions);

const outputPath = 'address-note.md'; 
fs.writeFileSync(outputPath, markdown);
