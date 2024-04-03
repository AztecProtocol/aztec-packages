import {
  AztecAddress,
  ContractFunctionInteraction,
  EthAddress,
  Fr,
  FunctionSelector,
  PXE,
  TxHash,
} from '@aztec/aztec.js';

import bodyParser from 'body-parser';
import express from 'express';
import { JSONRPCServer } from 'json-rpc-2.0';

import { deployContract, initSandbox, privateCall, publicCall, unconstrainedCall } from './sandbox.js';

const PORT = 5555;
const app = express();
app.use(bodyParser.json());

let pxe: PXE;

const server = new JSONRPCServer();

// Example: compute square root
server.addMethod('getSqrt', async params => {
  const values = params[0].Array.map(({ inner }: { inner: string }) => {
    return { inner: `${Math.sqrt(parseInt(inner, 16))}` };
  });
  return { values: [{ Array: values }] };
});

// Deploy a contract
server.addMethod('deployContract', async params => {
  let contractAddy = await deployContract(pxe);
  return { values: [{ Single: { inner: contractAddy.toString() } }] };
});

// Handles a call to an unconstrained function
// Todo: handle array of args and return values
server.addMethod('view', async params => {
  const contractAddress = AztecAddress.fromString(params[0].Single.inner);
  const functionSelector = FunctionSelector.fromString(params[1].Single.inner.slice(-8));

  // todo: type?
  const args = params[2].Array.map(({ inner }: { inner: string }) => inner);

  const result = await unconstrainedCall(pxe, contractAddress, functionSelector, args);

  return { values: [{ Single: { inner: new Fr(result).toString() } }] };
});

server.addMethod('debugLog', async params => {
  console.log('debug log: ' + params[0].Single.inner.toString());
  return { values: [{ Single: { inner: '0' } }] };
});

server.addMethod('callPrivateFunction', async params => {
  const contractAddress = AztecAddress.fromString(params[0].Single.inner);
  const functionSelector = FunctionSelector.fromString(params[1].Single.inner.slice(-8));
  const args: Fr[] = params[2].Array.map(({ inner }: { inner: string }) => Fr.fromString(inner));

  let txHash = await privateCall(pxe, contractAddress, functionSelector, args);

  // todo: handle revert -> return false? throw?
  return { values: [{ Single: { inner: txHash.toString() } }] };
});

server.addMethod('callPublicFunction', async params => {
  const contractAddress = AztecAddress.fromString(params[0].Single.inner);
  const functionSelector = FunctionSelector.fromString(params[1].Single.inner.slice(-8));
  const arg: Fr = Fr.fromString(params[2].toString());
  let txHash = await publicCall(pxe, contractAddress, functionSelector, arg);

  // todo: handle revert -> return false? throw?
  return { values: [{ Single: { inner: txHash.toString() } }] };
});

server.addMethod('getNumberOfNewNotes', async params => {
  const txHash = TxHash.fromString(params[0].Single.inner);

  const txEffect = await pxe.getTxEffect(txHash);

  if (!txEffect) {
    throw new Error('Invalid hash/no effect found');
  }

  const filteredNoteHashes = txEffect.noteHashes.filter(hash => hash.toString() != new Fr(0).toString());
  const numberOfNotes = filteredNoteHashes.length;

  return { values: [{ Single: { inner: numberOfNotes.toString() } }] };
});

app.post('/', (req, res) => {
  const jsonRPCRequest = req.body;
  server.receive(jsonRPCRequest).then(jsonRPCResponse => {
    if (jsonRPCResponse) {
      res.json(jsonRPCResponse);
    } else {
      res.sendStatus(204);
    }
  });
});

app.listen(PORT, () => {
  initSandbox().then(pxe_client => {
    pxe = pxe_client;
    console.log(`Oracle resolver running at port: ${PORT}`);
  });
});

export function toACVMField(
  value: AztecAddress | EthAddress | Fr | Buffer | boolean | number | bigint | string,
): string {
  let buffer;
  if (Buffer.isBuffer(value)) {
    buffer = value;
  } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
    buffer = new Fr(value).toBuffer();
  } else if (typeof value === 'string') {
    buffer = Fr.fromString(value).toBuffer();
  } else {
    buffer = value.toBuffer();
  }
  return `0x${adaptBufferSize(buffer).toString('hex')}`;
}

function adaptBufferSize(originalBuf: Buffer) {
  const buffer = Buffer.alloc(Fr.SIZE_IN_BYTES);
  if (originalBuf.length > buffer.length) {
    throw new Error('Buffer does not fit in field');
  }
  originalBuf.copy(buffer, buffer.length - originalBuf.length);
  return buffer;
}
