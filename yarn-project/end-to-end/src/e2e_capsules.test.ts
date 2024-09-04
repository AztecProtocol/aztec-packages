import { type AccountWallet, type DebugLogger, Fq, Fr, type PXE, Schnorr } from '@aztec/aztec.js';
import { pedersenHash, sha256ToField } from '@aztec/foundation/crypto';
import { CapsulesTestContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';
import { when } from 'jest-when';

import { setup } from './fixtures/utils.js';

const fetchMock = jest.spyOn(global, 'fetch');

describe('e2e_capsules_contract', () => {
  let wallet: AccountWallet;
  let logger: DebugLogger;
  let pxe: PXE;
  let teardown: () => Promise<void>;

  let capsulesContract: CapsulesTestContract;

  beforeAll(async () => {
    ({ teardown, wallet, logger, pxe } = await setup(1));

    capsulesContract = await CapsulesTestContract.deploy(wallet).send().deployed();

    logger.info(`Capsules contract deployed at ${capsulesContract.address}`);
  });

  afterEach(() => jest.resetAllMocks());

  afterAll(() => teardown());

  describe('nft usecase', () => {
    it('proves that our nft has a specific attribute', async () => {
      const topic = new Fr(6969);

      when(fetchMock)
        .calledWith(expect.toStartWith('MOCK_URL'))
        .mockImplementation(async () => {
          // Fetch BAYC #1
          const res = await fetch('https://ipfs.io/ipfs/QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1');
          const { attributes } = await res.json();

          // The response looks like this:
          // {
          //   image: 'ipfs://QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi',
          //   attributes: [
          //     { trait_type: 'Mouth', value: 'Grin' },
          //     { trait_type: 'Clothes', value: 'Vietnam Jacket' },
          //     { trait_type: 'Background', value: 'Orange' },
          //     { trait_type: 'Eyes', value: 'Blue Beams' },
          //     { trait_type: 'Fur', value: 'Robot' },
          //   ],
          // };

          const hashedFieldArray: Fr[] = attributes.map((attribute: { value: string }) =>
            sha256ToField([attribute.value]),
          );

          return {
            status: 200,
            // This is simply what the endpoint should return. Above is "mimicking" the computation done on the API serving the oracle.
            json: () => hashedFieldArray.map(field => field.toString()),
          } as unknown as Response;
        });

      await pxe.registerPlugin(capsulesContract.address, topic, new HttpPlugin('MOCK_URL'));

      await capsulesContract.methods.test().send().wait();
    });

    it('fetches price data from an external oracle', async () => {
      const topic = new Fr(1337);
      // Signing authority
      // Fq<0x1066e4f1b14df12a30433d20d5c3816f84435f9a0b2ee8ed4c80d70e268a541f>
      // x: Fr<0x149084b03a2ba5b321c0fcb93eddaf19566f9ce3948ffbafaf184db0e7594efb>
      // y: Fr<0x2c3a7f6b101422cdc22a05da22897d8c95ce7531077d6c735bbb346cfb4203d0>

      when(fetchMock)
        .calledWith(expect.toStartWith('MOCK_URL'))
        .mockImplementation(args => {
          const searchParams = new URLSearchParams((args as string).split('?')[1]);
          const input0 = searchParams.get('0');
          const input1 = searchParams.get('1');

          const input = [Fr.fromString(input0!), Fr.fromString(input1!)];

          // We populate with some arbitrary values
          const price1 = new Fr(1);
          const price2 = new Fr(2);
          const blockNumber = new Fr(50);
          // The message hash uses the input here so we can verify that the correct input was used inside the circuit.
          const hash = pedersenHash([topic, price1, price2, blockNumber, ...input]);

          const signedHash = new Schnorr().constructSignature(
            hash.toBuffer(),
            new Fq(0x1066e4f1b14df12a30433d20d5c3816f84435f9a0b2ee8ed4c80d70e268a541fn),
          );

          const ret = [price1, price2, blockNumber, ...signedHash.toFields()];

          return {
            status: 200,
            // This is simply what the endpoint should return. Above is "mimicking" the computation done on the API serving the oracle.
            json: () => ret.map(field => field.toString()),
          } as unknown as Response;
        });

      await pxe.registerPlugin(capsulesContract.address, topic, new HttpPlugin('MOCK_URL'));

      await capsulesContract.methods.test_price_feed().send().wait();
    });
  });
});

// This needs to be consolidated and moved.
class HttpPlugin {
  #fetchUri: string;

  constructor(fetchUri: string) {
    this.#fetchUri = fetchUri;
  }

  public async process(input: Fr[], topic: Fr): Promise<Fr[]> {
    let uri: string = `${this.#fetchUri.replace(/\/$/, '')}/${topic.toString()}`;

    if (input.length > 0) {
      uri = input.reduce((acc, curr, i) => `${acc}${i === 0 ? '?' : '&'}${i}=${curr.toString()}`, uri);
    }

    const res = await fetch(uri);
    const resJson = await res.json();

    const serialized = resJson.map(Fr.fromString);

    return serialized;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.#fetchUri);
  }

  static fromBuffer(buf: Buffer): HttpPlugin {
    return new HttpPlugin(buf.toString('utf-8'));
  }
}
