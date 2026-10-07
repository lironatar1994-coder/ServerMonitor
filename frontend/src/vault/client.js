export class VaultCrypto {
  constructor() {
    this.worker = new Worker(new URL("./crypto.worker.js", import.meta.url), {
      type: "module",
    });
    this.pending = new Map();
    this.worker.onmessage = ({ data }) => {
      const promise = this.pending.get(data.id);
      if (promise) {
        this.pending.delete(data.id);
        data.error
          ? promise.reject(new Error(data.error))
          : promise.resolve(data.value);
      }
    };
    this.worker.onerror = () => this.lock();
  }
  call(type, payload = {}) {
    if (!this.worker) return Promise.reject(new Error("הכספת נעולה."));
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }
  lock() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Error("הכספת נעולה."));
    this.pending.clear();
  }
}
