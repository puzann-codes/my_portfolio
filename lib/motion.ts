/**
 * Reduced-motion preference. Honours the OS setting, and also `?motion=reduce`
 * so the reduced experience can be reviewed without changing system settings.
 */
export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  return new URLSearchParams(window.location.search).get("motion") === "reduce";
}
