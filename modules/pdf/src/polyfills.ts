const scope = globalThis as unknown as Record<string, any>;

if (!scope.crypto) scope.crypto = {};

if (typeof scope.crypto.getRandomValues !== 'function') {
  scope.crypto.getRandomValues = (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
    return bytes;
  };
}

if (typeof scope.queueMicrotask !== 'function') {
  scope.queueMicrotask = (task: () => void) => {
    Promise.resolve().then(task);
  };
}

if (typeof scope.performance?.now !== 'function') {
  scope.performance = { ...scope.performance, now: () => Date.now() };
}

export {};
