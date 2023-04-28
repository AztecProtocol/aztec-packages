import * as msgpack from '@msgpack/msgpack';
// import camelCase from 'lodash.camelcase';
// import snakeCase from 'lodash.snakecase';

// /**
//  * Helper functions for transformation from underlying camel-case C++-defined format.
//  * This helps make using the raw output more idiomatic.
//  */
// function recursiveCamelCase(data: any): any {
//   if (Array.isArray(data)) {
//     return data.map(recursiveCamelCase);
//   } else if (data instanceof Uint8Array) {
//     return Buffer.from(data);
//   } else if (data && typeof data === 'object') {
//     const camelCaseData: any = {};

//     for (const key in data) {
//       camelCaseData[camelCase(key)] = recursiveCamelCase(data[key]);
//     }

//     return camelCaseData;
//   } else {
//     return data;
//   }
// }

function recursiveFixDecoded(data: any): any {
  if (Array.isArray(data)) {
    return data.map(recursiveFixDecoded);
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (data && typeof data === 'object') {
    const fixed: any = {};

    for (const key in data) {
      fixed[key] = recursiveFixDecoded(data[key]);
    }

    return fixed;
  } else {
    return data;
  }
}

export function decode(data: Uint8Array): any {
  return recursiveFixDecoded(msgpack.decode(data));
}

// Function that wraps msgpack.encode and converts keys from camelCase to snake_case
export function encode(data: any): Uint8Array {
  // const snakeCaseData = recursiveSnakeCase(data);
  return msgpack.encode(data);
}
