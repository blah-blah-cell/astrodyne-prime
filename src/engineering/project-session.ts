export type EngineeringArtifactKind = 'assembly' | 'cad' | 'aerodynamics' | 'jsbsim-validation' | 'openrocket-validation' | 'robotics' | 'flight';

export interface EngineeringArtifact {
  kind: EngineeringArtifactKind;
  revision: number;
  updatedAt: number;
  summary: string;
  data?: unknown;
}

export interface EngineeringProjectSnapshot {
  id: string;
  name: string;
  revision: number;
  updatedAt: number;
  artifacts: Partial<Record<EngineeringArtifactKind, EngineeringArtifact>>;
}

const STORAGE_KEY = 'astrodyne.engineering-project';

export class EngineeringProjectSession {
  private static snapshot: EngineeringProjectSnapshot = EngineeringProjectSession.load();
  private static listeners = new Set<(snapshot: EngineeringProjectSnapshot) => void>();

  private static load(): EngineeringProjectSnapshot {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
        if (stored?.id && stored?.artifacts) return stored;
      } catch { /* Start a clean project when persisted data is invalid. */ }
    }
    return { id: crypto.randomUUID?.() ?? `project-${Date.now()}`, name: 'Untitled Engineering Project', revision: 0, updatedAt: Date.now(), artifacts: {} };
  }

  static get(): EngineeringProjectSnapshot { return structuredClone(this.snapshot); }

  static setName(name: string): void {
    const clean = name.trim();
    if (!clean || clean === this.snapshot.name) return;
    this.snapshot.name = clean;
    this.commit();
  }

  static setArtifact(kind: EngineeringArtifactKind, summary: string, data?: unknown): void {
    const previous = this.snapshot.artifacts[kind];
    if (previous?.summary === summary && JSON.stringify(previous.data) === JSON.stringify(data)) return;
    this.snapshot.artifacts[kind] = { kind, revision: (previous?.revision ?? 0) + 1, updatedAt: Date.now(), summary, data };
    this.commit();
  }

  static subscribe(listener: (snapshot: EngineeringProjectSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }

  static import(snapshot: EngineeringProjectSnapshot): void {
    if (!snapshot?.id || !snapshot?.name || !snapshot?.artifacts) throw new Error('Invalid engineering project snapshot');
    this.snapshot = structuredClone(snapshot);
    this.commit();
  }

  private static commit(): void {
    this.snapshot.revision++;
    this.snapshot.updatedAt = Date.now();
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    const copy = this.get();
    this.listeners.forEach(listener => listener(copy));
  }
}
