// A coordinate is not a verified place name or barangay.
const COORDINATES = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export function isCoordinateLocation(raw) {
  const match = String(raw ?? '').match(COORDINATES);
  if (!match) return false;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function displayLocation(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return 'Unspecified';
  return isCoordinateLocation(text) ? `Coordinates: ${text}` : text;
}
