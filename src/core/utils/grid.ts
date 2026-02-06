export function cellLatLon(x: number, y: number, width: number, height: number): { lat: number; lon: number } {
  const lat = (y / (height - 1)) * 180 - 90;
  const lon = (x / (width - 1)) * 360 - 180;
  return { lat, lon };
}
