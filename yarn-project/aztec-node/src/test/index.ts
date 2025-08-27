import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { P2P } from '@aztec/p2p';
import { SequencerClient } from '@aztec/sequencer-client';
import { EpochPruneWatcher, type SlasherClientInterface } from '@aztec/slasher';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { L2LogsSource, Service, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { GlobalVariableBuilder as GlobalVariableBuilderInterface } from '@aztec/stdlib/tx';

import type { AztecNodeConfig } from '../aztec-node/config.js';
import { AztecNodeService } from '../aztec-node/server.js';
import { Sentinel } from '../sentinel/sentinel.js';

export declare class TestAztecNodeService extends AztecNodeService {
  declare public config: AztecNodeConfig;
  declare public p2pClient: P2P;
  declare public blockSource: L2BlockSource & Partial<Service>;
  declare public logsSource: L2LogsSource;
  declare public contractDataSource: ContractDataSource;
  declare public l1ToL2MessageSource: L1ToL2MessageSource;
  declare public worldStateSynchronizer: WorldStateSynchronizer;
  declare public sequencer: SequencerClient | undefined;
  declare public slasherClient: SlasherClientInterface | undefined;
  declare public validatorsSentinel: Sentinel | undefined;
  declare public epochPruneWatcher: EpochPruneWatcher | undefined;
  declare public l1ChainId: number;
  declare public version: number;
  declare public globalVariableBuilder: GlobalVariableBuilderInterface;
  declare public epochCache: EpochCacheInterface;
  declare public packageVersion: string;
}
