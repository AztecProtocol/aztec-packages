export class MemDb {
  private data: { [key: string]: any } = {};
  private tx: { [key: string]: any } | undefined;

  set(key: string, value: any) {
    if (this.tx) {
      this.tx[key] = value;
    } else {
      this.data[key] = value;
    }
  }

  get(key: string) {
    if (this.tx && this.tx[key] !== undefined) {
      return this.tx[key];
    }
    return this.data[key];
  }

  del(key: string) {
    if (this.tx) {
      this.tx[key] = undefined;
      return;
    }
    delete this.data[key];
  }

  keys() {
    return Array.from(new Set([...Object.keys(this.data), ...Object.keys(this.tx || {})]));
  }

  commit() {
    if (!this.tx) {
      throw new Error('tx not in progress.');
    }
    Object.assign(this.data, this.tx);
    this.tx = undefined;
  }

  rollback() {
    if (!this.tx) {
      throw new Error('tx not in progress.');
    }
    this.tx = undefined;
  }

  startTx() {
    if (this.tx) {
      throw new Error('MemDb can only handle 1 tx at a time.');
    }
    this.tx = {};
  }
}
