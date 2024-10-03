// This exists for public state squashing
//
// It has advantages over an traditional map as when we delete an item,
// we can insert to the back of the map
// This filtering is inefficient and a bottleneck over large lists
// Additionally getting values implements a copy
export class OrderedMap<K, V> {
    map = new Map<K, V>();
    keys: K[] = [];

    constructor() {}

    set(key: K, value: V) {
      if (this.map.has(key)) {
        // Remove the key from the keys array
        this.keys = this.keys.filter(k => k !== key);
      }
      // Add the key to the end of the keys array
      this.keys.push(key);
      // Set the value in the map
      this.map.set(key, value);
    }

    get(key: K) {
      return this.map.get(key);
    }

    has(key: K) {
      return this.map.has(key);
    }

    delete(key: K) {
      if (this.map.delete(key)) {
        this.keys = this.keys.filter(k => k !== key);
        return true;
      }
      return false;
    }

    values() {
      return this.keys.map(key => this.map.get(key)!);
    }

    *[Symbol.iterator]() {
      for (let key of this.keys) {
        yield [key, this.map.get(key)];
      }
    }

  }