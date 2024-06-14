/**
 * Rounds the value to the nearest multiple of the given precision.
 * @param {number} value
 * @param {number} precision
 */
export function roundTo(value, precision) {
  return Math.round(value / precision) * precision;
}
