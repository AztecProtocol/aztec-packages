import { TxHash } from '@aztec/ethereum.js/eth_rpc';
import { mock, MockProxy } from 'jest-mock-extended';
import { MockL2DataEncoder } from './mock-l2-block-encoder.js';
import { L2BlockData } from '../receiver.js';
import { EncodedL2BlockData, L2BlockPublisher, PublisherDataEncoder, PublisherTxSender } from './l2-block-publisher.js';
import { sleep } from '../utils.js';

describe('L2BlockPublisher', () => {
  let encoder: PublisherDataEncoder;
  let txSender: MockProxy<PublisherTxSender>;
  let txHash: string;
  let txReceipt: { transactionHash: string; status: boolean };
  let l2BlockData: L2BlockData;
  let l2EncodedData: EncodedL2BlockData;

  let publisher: L2BlockPublisher;

  beforeEach(() => {
    l2BlockData = { id: 42 };
    const mockEncoder = new MockL2DataEncoder();
    l2EncodedData = mockEncoder.mockData;
    encoder = mockEncoder;

    txSender = mock<PublisherTxSender>();
    txHash = TxHash.random().toString();
    txReceipt = { transactionHash: txHash, status: true };
    txSender.sendTransaction.mockResolvedValueOnce(txHash);
    txSender.getTransactionReceipt.mockResolvedValueOnce(txReceipt);

    publisher = new L2BlockPublisher(txSender, encoder, { sleepTimeMs: 1 });
  });

  it('publishes l2 block to l1', async () => {
    const result = await publisher.processL2Block(l2BlockData);

    expect(result).toEqual(true);
    expect(txSender.sendTransaction).toHaveBeenCalledWith(l2EncodedData);
    expect(txSender.getTransactionReceipt).toHaveBeenCalledWith(txHash);
  });

  it('retries if sending a tx fails', async () => {
    txSender.sendTransaction.mockReset().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(txHash);

    const result = await publisher.processL2Block(l2BlockData);

    expect(result).toEqual(true);
    expect(txSender.sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries if fetching the receipt fails', async () => {
    txSender.getTransactionReceipt.mockReset().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(txReceipt);

    const result = await publisher.processL2Block(l2BlockData);

    expect(result).toEqual(true);
    expect(txSender.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it('retries if tx reverts', async () => {
    txSender.getTransactionReceipt
      .mockReset()
      .mockResolvedValueOnce({ ...txReceipt, status: false })
      .mockResolvedValueOnce(txReceipt);

    const result = await publisher.processL2Block(l2BlockData);

    expect(result).toEqual(true);
    expect(txSender.sendTransaction).toHaveBeenCalledTimes(2);
    expect(txSender.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it('returns false if interrupted', async () => {
    txSender.sendTransaction.mockReset().mockImplementationOnce(() => sleep(10, txHash));

    const resultPromise = publisher.processL2Block(l2BlockData);
    publisher.interrupt();
    const result = await resultPromise;

    expect(result).toEqual(false);
    expect(txSender.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('waits for fee distributor balance', () => {
    pending();
  });

  it('fails if contract is changed underfoot', () => {
    pending();
  });
});
