export type MeasurementPrecision = 2 | 3 | 4 | 6;

const STORAGE_KEY = 'astrodyne.measurement-precision';

export class EngineeringMeasurements {
  private static precision: MeasurementPrecision = EngineeringMeasurements.loadPrecision();
  private static listeners = new Set<() => void>();

  private static loadPrecision(): MeasurementPrecision {
    if (typeof localStorage === 'undefined') return 3;
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return ([2, 3, 4, 6] as number[]).includes(value) ? value as MeasurementPrecision : 3;
  }

  static getPrecision(): MeasurementPrecision { return this.precision; }

  static setPrecision(value: number): void {
    if (!([2, 3, 4, 6] as number[]).includes(value)) return;
    this.precision = value as MeasurementPrecision;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(value));
    this.listeners.forEach(listener => listener());
  }

  static subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  static scalar(value: number, unit = '', digits: number = this.precision): string {
    if (!Number.isFinite(value)) return `—${unit ? ` ${unit}` : ''}`;
    return `${value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true
    })}${unit ? ` ${unit}` : ''}`;
  }

  static adaptive(value: number, unit: string, significantDigits = 6): string {
    if (!Number.isFinite(value)) return `— ${unit}`;
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude >= 1e7 || magnitude < 1e-4)) {
      return `${value.toExponential(Math.max(1, significantDigits - 1))} ${unit}`;
    }
    const integerDigits = magnitude >= 1 ? Math.floor(Math.log10(magnitude)) + 1 : 1;
    return this.scalar(value, unit, Math.max(0, significantDigits - integerDigits));
  }

  static vector(values: readonly number[], unit: string, digits: number = this.precision): string {
    return `[${values.map(value => value.toFixed(digits)).join(', ')}] ${unit}`;
  }
}
