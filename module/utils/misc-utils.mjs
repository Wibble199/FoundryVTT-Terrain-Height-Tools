/**
 * Determines if two numbers are equal within the given precision.
 * @param {number} a
 * @param {number} b
 * @param {number} precision
 */
export function roughlyEqual(a, b, precision) {
  return Math.abs(a - b) <= precision;
}

/**
 * Rounds the value to the nearest multiple of the given precision.
 * @param {number} value
 * @param {number} precision
 */
export function roundTo(value, precision) {
  return Math.round(value / precision) * precision;
}
