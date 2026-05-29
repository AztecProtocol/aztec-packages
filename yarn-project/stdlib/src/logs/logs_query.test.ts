import { jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { MAX_RPC_LEN } from '../interfaces/api_limit.js';
import { PrivateLogsQuerySchema, PublicLogsQuerySchema } from './logs_query.js';
import { SiloedTag } from './siloed_tag.js';
import { Tag } from './tag.js';

/** Serialize a query through the JSON wire format the schemas are designed to parse. */
function wire<T>(value: T): unknown {
  return JSON.parse(jsonStringify(value));
}

describe('PrivateLogsQuerySchema', () => {
  it('accepts a tags array of exactly MAX_RPC_LEN entries', () => {
    const tags = Array.from({ length: MAX_RPC_LEN }, () => SiloedTag.random());
    expect(() => PrivateLogsQuerySchema.parse(wire({ tags }))).not.toThrow();
  });

  it('rejects a tags array longer than MAX_RPC_LEN', () => {
    const tags = Array.from({ length: MAX_RPC_LEN + 1 }, () => SiloedTag.random());
    expect(() => PrivateLogsQuerySchema.parse(wire({ tags }))).toThrow(/at most/);
  });

  it('rejects an empty tags array', () => {
    expect(() => PrivateLogsQuerySchema.parse(wire({ tags: [] }))).toThrow();
  });
});

describe('PublicLogsQuerySchema', () => {
  it('accepts a tags array of exactly MAX_RPC_LEN entries', async () => {
    const contractAddress = await AztecAddress.random();
    const tags = Array.from({ length: MAX_RPC_LEN }, () => Tag.random());
    expect(() => PublicLogsQuerySchema.parse(wire({ contractAddress, tags }))).not.toThrow();
  });

  it('rejects a tags array longer than MAX_RPC_LEN', async () => {
    const contractAddress = await AztecAddress.random();
    const tags = Array.from({ length: MAX_RPC_LEN + 1 }, () => Tag.random());
    expect(() => PublicLogsQuerySchema.parse(wire({ contractAddress, tags }))).toThrow(/at most/);
  });

  it('rejects an empty tags array', async () => {
    const contractAddress = await AztecAddress.random();
    expect(() => PublicLogsQuerySchema.parse(wire({ contractAddress, tags: [] }))).toThrow();
  });
});
