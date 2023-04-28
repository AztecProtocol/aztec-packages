import * as msgpack from '@msgpack/msgpack';

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
  return msgpack.encode(data);
}
