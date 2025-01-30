export enum Database {
  DATA = 'data',
  INDEX = 'index',
}

export const CURSOR_PAGE_SIZE = 10;

export enum LMDBMessageType {
  OPEN_DATABASE = 100,
  GET,
  HAS,

  START_CURSOR,
  ADVANCE_CURSOR,
  CLOSE_CURSOR,

  BATCH,

  STATS,

  CLOSE,
}

type Key = Uint8Array;
type Value = Uint8Array;
type OptionalValues = Array<Value[] | null>;
type KeyOptionalValues = [Key, null | Array<Value>];
type KeyValues = [Key, Value[]];

interface OpenDatabaseRequest {
  db: string;
  uniqueKeys?: boolean;
}

interface GetRequest {
  keys: Key[];
  db: string;
}

interface GetResponse {
  values: OptionalValues;
}

interface HasRequest {
  entries: KeyOptionalValues[];
  db: string;
}

interface StartCursorRequest {
  key: Key;
  reverse: boolean;
  count: number | null;
  onePage: boolean | null;
  db: string;
}

interface AdvanceCursorRequest {
  cursor: number;
  count: number | null;
}

interface CloseCursorRequest {
  cursor: number;
}

export interface Batch {
  addEntries: Array<KeyValues>;
  removeEntries: Array<KeyOptionalValues>;
}

interface BatchRequest {
  batches: Map<string, Batch>;
}

export type LMDBRequestBody = {
  [LMDBMessageType.OPEN_DATABASE]: OpenDatabaseRequest;

  [LMDBMessageType.GET]: GetRequest;
  [LMDBMessageType.HAS]: HasRequest;

  [LMDBMessageType.START_CURSOR]: StartCursorRequest;
  [LMDBMessageType.ADVANCE_CURSOR]: AdvanceCursorRequest;
  [LMDBMessageType.CLOSE_CURSOR]: CloseCursorRequest;

  [LMDBMessageType.BATCH]: BatchRequest;

  [LMDBMessageType.STATS]: void;

  [LMDBMessageType.CLOSE]: void;
};

interface GetResponse {
  values: OptionalValues;
}

interface HasResponse {
  exists: boolean[];
}

interface StartCursorResponse {
  cursor: number | null;
  entries: Array<KeyValues>;
}

interface AdvanceCursorResponse {
  entries: Array<KeyValues>;
  done: boolean;
}

interface BatchResponse {
  durationNs: number;
}

interface BoolResponse {
  ok: true;
}

interface StatsResponse {
  stats: Array<{
    name: string;
    numDataItems: number;
    totalUsedSize: number;
  }>;
  dbMapSizeBytes: number;
}

export type LMDBResponseBody = {
  [LMDBMessageType.OPEN_DATABASE]: BoolResponse;

  [LMDBMessageType.GET]: GetResponse;
  [LMDBMessageType.HAS]: HasResponse;

  [LMDBMessageType.START_CURSOR]: StartCursorResponse;
  [LMDBMessageType.ADVANCE_CURSOR]: AdvanceCursorResponse;
  [LMDBMessageType.CLOSE_CURSOR]: BoolResponse;

  [LMDBMessageType.BATCH]: BatchResponse;

  [LMDBMessageType.STATS]: StatsResponse;

  [LMDBMessageType.CLOSE]: BoolResponse;
};

export interface LMDBMessageChannel {
  sendMessage<T extends LMDBMessageType>(msgType: T, body: LMDBRequestBody[T]): Promise<LMDBResponseBody[T]>;
}
