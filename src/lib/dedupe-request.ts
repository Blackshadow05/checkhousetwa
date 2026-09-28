const inflight = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const current = inflight.get(key);
  if (current) return current as Promise<T>;
  const request = load().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
