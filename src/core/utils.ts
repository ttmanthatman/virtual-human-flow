export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}
