const scope = globalThis as unknown as Record<string, any>;

if (typeof scope.queueMicrotask !== 'function') {
  scope.queueMicrotask = (task: () => void) => {
    Promise.resolve().then(task);
  };
}

if (typeof scope.performance?.now !== 'function') {
  scope.performance = { ...scope.performance, now: () => Date.now() };
}

export {};
