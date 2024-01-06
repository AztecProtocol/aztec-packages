import { default as hash } from 'hash.js';

import { Fr } from '../../fields/index.js';

export const sha256 = (data: Buffer): Buffer => Buffer.from(hash.sha256().update(data).digest());
export const sha256ToField = (data: Buffer): Fr => Fr.fromBufferReduce(sha256(data));
