function toCamelCase(str: string) {
  return str.replace(/[-_]+([a-zA-Z])/g, function (match, letter) {
    return letter.toUpperCase();
  });
}
function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

type Schema = Record<string, any>;

function generateTypeScript(outputDecls: Record<string, string> = {}, schema: Schema): string {
  function getType(type: any): string {
    if (Array.isArray(type)) {
      const [container, ...typeArgs] = type;
      if (container === 'array') {
        const [innerType, size] = typeArgs;
        return `FixedArray<${getType(innerType)}, ${size}>`;
      } else if (container === 'vector') {
        if (typeArgs[0] == 'unsigned char') {
          return 'Buffer';
        }
        return `${getType(typeArgs[0])}[]`;
      } else if (container === 'struct') {
        return getType(typeArgs[0]);
      } else if (container === 'shared_ptr') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_struct, _name, definition] = typeArgs[0];
        return getType(definition);
      } else if (container === 'map') {
        return `Record<${getType(typeArgs[0])}, ${getType(typeArgs[1])}>`;
      }
    } else if (typeof type === 'string') {
      switch (type) {
        case 'bool':
          return 'boolean';
        case 'unsigned int':
          return 'number';
        case 'string':
          return type;
        case 'field':
          return 'FieldBuf';
        case 'address':
          return 'AztecAddressBuf';
        default:
          return 'I' + capitalizeFirstLetter(toCamelCase(type));
      }
    } else if (typeof type === 'object') {
      const typeName = 'I' + capitalizeFirstLetter(toCamelCase(type.__typename));
      generateInterface(typeName, type);
      return typeName;
    }

    throw new Error(`Unsupported type: ${type}`);
  }

  function generateInterface(name: string, properties: Schema) {
    let result = `export interface ${name} {\n`;
    for (const [key, value] of Object.entries(properties)) {
      if (key === '__typename') continue;
      result += `  ${toCamelCase(key)}: ${getType(value)};\n`;
    }
    outputDecls[name] = result + '}';
  }
  return getType(schema);
}

export class TypeScriptCompiler {
  typeDecls: Record<string, string> = {
    '0': `
/* eslint-disable */
// GENERATED FILE DO NOT EDIT
import { Buffer } from "buffer";
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/index.js';

// Utility types
export type FixedArray<T, L extends number> = [T, ...T[]] & { length: L };

// Aliases (TODO strong typing?)
export type AztecAddressBuf = Buffer;
export type FieldBuf = Buffer;
`,
  };
  funcDecls: Record<string, string> = {};
  processSchema(schema: Schema): string {
    return generateTypeScript(this.typeDecls, schema);
  }
  processCbind(name: string, cbind: { args: Schema[]; ret: Schema }) {
    // TODO output it
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_tuple, ...args] = cbind.args;
    const compiled = { args: args.map(arg => this.processSchema(arg)), ret: this.processSchema(cbind.ret) };
    const argStrings = args.map((arg, i) => `arg${i}: ${this.processSchema(arg)}`);
    // TODO cleanup
    this.funcDecls[name] = `export function ${toCamelCase(name)}(wasm: CircuitsWasm, ${argStrings.join(
      ', ',
    )}): Promise<${this.processSchema(cbind.ret)}> {
  return callCbind(wasm, '${name}', [${argStrings.map(s => s.split(':')[0]).join(', ')}]);
}`;
    return compiled;
  }
  compile(): string {
    return Object.values(this.typeDecls).concat(Object.values(this.funcDecls)).join('\n');
  }
}
