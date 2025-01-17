import { MessageHeader, TypedMessage } from '@aztec/foundation/message';

import bindings from 'bindings';
import { decode, encode } from 'msgpackr';

const NATIVE_MODULE = bindings('nodejs_module');
const db = new NATIVE_MODULE['Lmdb']('test');

db.call(
  encode(
    new TypedMessage(100, new MessageHeader({ messageId: 100 }), {
      db_name: 'foo',
    }),
  ),
);

db.call(
  encode(
    new TypedMessage(102, new MessageHeader({ messageId: 101 }), {
      db_name: 'foo',
      key: '123',
      value: Buffer.from('the value'),
    }),
  ),
);

const resp = await db.call(
  encode(
    new TypedMessage(101, new MessageHeader({ messageId: 102 }), {
      db_name: 'foo',
      key: '123',
    }),
  ),
);

console.log(decode(resp).value.value.toString());
