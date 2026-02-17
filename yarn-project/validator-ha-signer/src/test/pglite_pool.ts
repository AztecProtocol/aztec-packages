/**
 * Vendored pg-compatible Pool/Client wrapper for PGlite.
 *
 * Copied from @middle-management/pglite-pg-adapter v0.0.3
 * https://www.npmjs.com/package/@middle-management/pglite-pg-adapter
 *
 * Modifications:
 * - Converted to ESM and TypeScript
 * - Uses PGliteInterface instead of PGlite class to avoid TypeScript
 *   type mismatches from ESM/CJS dual package resolution with private fields
 * - Simplified rowCount calculation to handle CTEs properly
 */
import type { PGliteInterface } from '@electric-sql/pglite';
import { EventEmitter } from 'events';
import type { QueryResult, QueryResultRow } from 'pg';
import { Readable, Writable } from 'stream';

export interface PoolConfig {
  pglite: PGliteInterface;
  max?: number;
  min?: number;
}

interface ClientConfig {
  pglite: PGliteInterface;
  host?: string;
  port?: number;
  ssl?: boolean;
}

export class Client extends EventEmitter {
  protected pglite: PGliteInterface;
  protected _connected = false;
  readonly host: string;
  readonly port: number;
  readonly ssl: boolean;
  readonly connection: object;

  // Stub implementations for pg compatibility
  readonly copyFrom = (): Writable => new Writable();
  readonly copyTo = (): Readable => new Readable();
  readonly pauseDrain = (): void => {};
  readonly resumeDrain = (): void => {};
  readonly escapeLiteral = (str: string): string => `'${str.replace(/'/g, "''")}'`;
  readonly escapeIdentifier = (str: string): string => `"${str.replace(/"/g, '""')}"`;
  readonly setTypeParser = (): void => {};
  readonly getTypeParser = (): ((value: string) => unknown) => (value: string) => value;

  constructor(config: ClientConfig) {
    super();
    this.pglite = config.pglite;
    this.host = config.host || 'localhost';
    this.port = config.port || 5432;
    this.ssl = typeof config.ssl === 'boolean' ? config.ssl : !!config.ssl;
    this.connection = {};
  }

  connect(): Promise<void> {
    if (this._connected) {
      return Promise.resolve();
    }
    this._connected = true;
    this.emit('connect');
    return Promise.resolve();
  }

  end(): Promise<void> {
    if (!this._connected) {
      return Promise.resolve();
    }
    this._connected = false;
    this.emit('end');
    return Promise.resolve();
  }

  async query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>> {
    if (!this._connected) {
      throw new Error('Client is not connected');
    }
    const result = await this.pglite.query<R>(text, values);
    return this.convertPGliteResult(result);
  }

  protected convertPGliteResult<R extends QueryResultRow>(result: {
    rows: R[];
    fields: Array<{ name: string; dataTypeID: number }>;
    affectedRows?: number;
  }): QueryResult<R> {
    return {
      command: '',
      rowCount: 'affectedRows' in result ? (result.affectedRows ?? 0) : result.rows.length,
      oid: 0,
      fields: result.fields.map(field => ({
        name: field.name,
        tableID: 0,
        columnID: 0,
        dataTypeID: field.dataTypeID,
        dataTypeSize: -1,
        dataTypeModifier: -1,
        format: 'text',
      })),
      rows: result.rows,
    };
  }

  get connected(): boolean {
    return this._connected;
  }
}

export class Pool extends EventEmitter {
  private clients: PoolClient[] = [];
  private availableClients: PoolClient[] = [];
  private waitingQueue: Array<(client: PoolClient) => void> = [];
  private _ended = false;
  private pglite: PGliteInterface;
  private _config: PoolConfig;

  readonly expiredCount = 0;
  readonly options: PoolConfig;

  constructor(config: PoolConfig) {
    super();
    this._config = { max: 10, min: 0, ...config };
    this.pglite = config.pglite;
    this.options = config;
  }

  get totalCount(): number {
    return this.clients.length;
  }

  get idleCount(): number {
    return this.availableClients.length;
  }

  get waitingCount(): number {
    return this.waitingQueue.length;
  }

  get ending(): boolean {
    return this._ended;
  }

  get ended(): boolean {
    return this._ended;
  }

  connect(): Promise<PoolClient> {
    if (this._ended) {
      return Promise.reject(new Error('Pool is ended'));
    }

    if (this.availableClients.length > 0) {
      const client = this.availableClients.pop()!;
      client._markInUse();
      return Promise.resolve(client);
    }

    if (this.clients.length < (this._config.max || 10)) {
      const client = new PoolClient(this.pglite, this);
      this.clients.push(client);
      return Promise.resolve(client);
    }

    return new Promise(resolve => {
      this.waitingQueue.push(resolve);
    });
  }

  async query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>> {
    const client = await this.connect();
    try {
      return await client.query<R>(text, values);
    } finally {
      client.release();
    }
  }

  releaseClient(client: PoolClient): void {
    const index = this.clients.indexOf(client);
    if (index !== -1) {
      client._markAvailable();
      if (this.waitingQueue.length > 0) {
        const resolve = this.waitingQueue.shift()!;
        client._markInUse();
        resolve(client);
      } else {
        this.availableClients.push(client);
      }
    }
  }

  end(): Promise<void> {
    this._ended = true;
    this.clients.forEach(client => client._markReleased());
    this.clients = [];
    this.availableClients = [];
    this.emit('end');
    return Promise.resolve();
  }
}

export class PoolClient extends Client {
  private pool: Pool;
  private _released = false;
  private _inUse = true;
  private _userReleased = false;

  constructor(pglite: PGliteInterface, pool: Pool) {
    super({ pglite });
    this.pool = pool;
    this._connected = true;
  }

  override async query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>> {
    if (this._userReleased && !this._inUse) {
      throw new Error('Client has been released back to the pool');
    }
    const result = await this.pglite.query<R>(text, values);
    return this.convertPGliteResult(result);
  }

  release(): void {
    if (this._released || this._userReleased) {
      return;
    }
    this._userReleased = true;
    this.pool.releaseClient(this);
  }

  override end(): Promise<void> {
    this.release();
    return Promise.resolve();
  }

  _markInUse(): void {
    this._inUse = true;
    this._userReleased = false;
  }

  _markAvailable(): void {
    this._inUse = false;
    this._userReleased = false;
  }

  _markReleased(): void {
    this._released = true;
    this._inUse = false;
    this._userReleased = true;
  }

  override get connected(): boolean {
    return this._connected && !this._released;
  }
}
