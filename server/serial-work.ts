/** An explicit capacity-one queue. Work starts only after its predecessor commits.
 * A rejection stops the queue; callers choose whether an item-level failure can recover.
 */
export function serialWork<T>(items: readonly T[], work: (item: T) => Promise<unknown>): Promise<void> {
  return items.reduce<Promise<void>>((prior, item) => prior.then(() => work(item)).then(() => undefined), Promise.resolve());
}

/** Record the failing boundary without replacing error identity, message, or cause.
 * Weak storage avoids serializing private error contents or retaining completed failures.
 */
const boundaries = new WeakMap<object, string[]>();
export function markFailure(error: unknown, boundary: string): unknown {
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
    boundaries.set(error, [...(boundaries.get(error) ?? []), boundary]);
  }
  return error;
}
export function failureBoundaries(error: unknown): readonly string[] {
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) return [...(boundaries.get(error) ?? [])];
  return [];
}
