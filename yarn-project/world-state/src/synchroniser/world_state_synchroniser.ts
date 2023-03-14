export enum WorldStateRunningState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

export interface WorldStateStatus {
  state: WorldStateRunningState;
  syncedToRollup: number;
}

export interface WorldStateSynchroniser {
  start(): void;
  status(): Promise<WorldStateStatus>;
  stop(): Promise<void>;
}
