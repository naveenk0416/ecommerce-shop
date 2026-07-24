export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = structuredClone(obj) as unknown as Record<string, unknown>;
  let cursor = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    cursor = cursor[keys[i]] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone as unknown as T;
}
