/**
 * Formats a 0-100 scale risk or factor score for display on a 0-10 scale.
 * Divides by 10 and returns 1 decimal place (e.g. 52.4 -> "5.2").
 * Guards against null, undefined, or NaN to return "N/A" fallback.
 */
export function formatRiskScore(score) {
  if (score === null || score === undefined || score === '' || isNaN(Number(score))) {
    return 'N/A';
  }
  return (Number(score) / 10).toFixed(1);
}
