/**
 * Checks if the `check` number is between `a` and `b`.
 * `a` and `b` do not have to be sorted (`a` can be bigger or smaller than `b`).
 * @param {number} a
 * @param {number} b
 * @param {number} check
 * @param {boolean} [inclusive=true] If `true`, allows equals.
 */
export function between(a, b, check, inclusive = true) {
  if (inclusive && (a === check || b === check)) return true;
  return Math.min(a, b) < check && Math.max(a, b) > check;
}
