import { type LogFn } from '@aztec/foundation/log';
import { type AztecAsyncMap, type AztecAsyncKVStore, } from '@aztec/kv-store';


export class AliasedDB<T extends readonly string[]> {

  protected aliasTypes!: T;
  protected aliases!: AztecAsyncMap<string, Buffer>;
  protected userLog!: LogFn;

  private static instance;

  protected constructor() {}

  static get Instance() {
    if (!this.instance) {
      this.instance = new this();
    }

    return this.instance;
  }

  tryRetrieveAlias(arg: string) {
    try {
      return this.retrieveAlias(arg);
    } catch {
      return arg;
    }
  }

  async retrieveAlias(arg: string) {
    if (this.aliasTypes.find(alias => arg.startsWith(`${alias}:`))) {
      const [type, ...alias] = arg.split(':');
      const data = await this.aliases.getAsync(`${type}:${alias.join(':') ?? 'last'}`);
      if (!data) {
        throw new Error(`Could not find alias ${arg}`);
      }
      return data.toString();
    } else {
      throw new Error(`Aliases must start with one of ${this.aliasTypes.join(', ')}`);
    }
  }

  async listAliases(type?: T[number]) {
    const result = [];
    if (type && !this.aliasTypes.includes(type)) {
      throw new Error(`Unknown alias type ${type}`);
    }
    for await (const [key, value] of this.aliases.entriesAsync()) {
      if (!type || key.startsWith(`${type}:`)) {
        result.push({ key, value: value.toString() });
      }
    }
    return result;
  }

  async storeAlias(type: T[number], key: string, value: Buffer, log: LogFn = this.userLog) {
    await this.aliases.set(`${type}:${key}`, value);
    log(`Data stored in database with alias ${type}:${key}`);
  }

  init(aliases: T, store: AztecAsyncKVStore, userLog: LogFn) {
    this.aliasTypes = aliases;
    this.aliases = store.openMap('aliases');
    this.userLog = userLog;
  }
}
