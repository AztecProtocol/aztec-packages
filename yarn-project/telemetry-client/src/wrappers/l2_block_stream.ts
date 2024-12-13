import {
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
} from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

/** Extends an L2BlockStream with a tracer to create a new trace per iteration. */
export class TraceableL2BlockStream extends L2BlockStream implements Traceable {
  constructor(
    l2BlockSource: Pick<L2BlockSource, 'getBlocks' | 'getBlockHeader' | 'getL2Tips'>,
    localData: L2BlockStreamLocalDataProvider,
    handler: L2BlockStreamEventHandler,
    public readonly tracer: Tracer,
    private readonly name: string = 'L2BlockStream',
    log = createLogger('types:block_stream'),
    opts: {
      proven?: boolean;
      pollIntervalMS?: number;
      batchSize?: number;
      startingBlock?: number;
    } = {},
  ) {
    super(l2BlockSource, localData, handler, log, opts);
  }

  // We need to use a non-arrow function to be able to access `this`
  // See https://www.typescriptlang.org/docs/handbook/2/functions.html#declaring-this-in-a-function
  @trackSpan(function () {
    return `${this!.name}.work`;
  })
  override work() {
    return super.work();
  }
}
