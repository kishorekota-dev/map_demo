/**
 * KeyedMutex
 *
 * Serializes async operations that share the same key (e.g. a sessionId) so
 * concurrent read-modify-write updates to the same in-memory session cannot
 * clobber one another (last-writer-wins). Different keys run concurrently.
 */
class KeyedMutex {
    constructor() {
        this._tails = new Map();
    }

    runExclusive(key, fn) {
        const previous = this._tails.get(key) || Promise.resolve();
        const run = previous.then(fn, fn);
        const tail = run.then(() => {}, () => {});
        this._tails.set(key, tail);
        tail.then(() => {
            if (this._tails.get(key) === tail) {
                this._tails.delete(key);
            }
        });
        return run;
    }

    get activeKeys() {
        return this._tails.size;
    }
}

module.exports = KeyedMutex;
