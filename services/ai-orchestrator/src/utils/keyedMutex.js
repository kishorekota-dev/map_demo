/**
 * KeyedMutex
 *
 * Serializes async operations that share the same key (e.g. a sessionId).
 * Session mutators do read-modify-write on conversation history / collected
 * data; without serialization two concurrent requests for the same session
 * read the same base state and the second write clobbers the first
 * (last-writer-wins), silently dropping messages or collected fields.
 *
 * runExclusive(key, fn) guarantees that for a given key, fns run one at a time
 * in call order. Different keys run concurrently. The internal chain is cleaned
 * up once a key is idle so the map does not grow unbounded.
 */
class KeyedMutex {
  constructor() {
    this._tails = new Map();
  }

  runExclusive(key, fn) {
    const previous = this._tails.get(key) || Promise.resolve();

    // Run fn after the previous holder settles (success OR failure), so one
    // rejected task never deadlocks the queue for that key.
    const run = previous.then(fn, fn);

    // Normalised tail that always resolves once `run` settles.
    const tail = run.then(() => {}, () => {});
    this._tails.set(key, tail);

    // Drop the entry when this is the last queued task for the key.
    tail.then(() => {
      if (this._tails.get(key) === tail) {
        this._tails.delete(key);
      }
    });

    return run;
  }

  /** Number of keys with in-flight/queued work (observability/tests). */
  get activeKeys() {
    return this._tails.size;
  }
}

module.exports = KeyedMutex;
