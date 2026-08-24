import { RocketAeroConfig, BarrowmanAerodynamicsSolver } from './barrowman-solver.js';
import { RocketTrajectoryPredictor } from './trajectory-predictor.js';

export interface OptimizationGoal {
  targetApogeeM: number;
  minimumStabilityCalibers: number;
  population?: number;
  generations?: number;
}

export interface OptimizationResult {
  config: RocketAeroConfig;
  apogeeM: number;
  stabilityCalibers: number;
  fitness: number;
  evaluations: number;
  generations: number;
}

interface Candidate { noseLengthM: number; finSpanM: number; rootChordM: number; tipChordM: number; fitness: number; }

export class RocketEvolutionaryOptimizer {
  public static optimize(base: RocketAeroConfig, goal: OptimizationGoal, seed = 1337): OptimizationResult {
    const populationSize = Math.max(6, goal.population ?? 12);
    const generations = Math.max(2, goal.generations ?? 8);
    let state = seed >>> 0;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 0x100000000; };
    const make = (parent?: Candidate): Candidate => ({
      noseLengthM: this.clamp((parent?.noseLengthM ?? base.noseCone.lengthM) * (0.82 + random() * 0.36), 0.18, 0.65),
      finSpanM: this.clamp((parent?.finSpanM ?? base.finSet.spanM) * (0.75 + random() * 0.5), 0.035, 0.18),
      rootChordM: this.clamp((parent?.rootChordM ?? base.finSet.rootChordM) * (0.8 + random() * 0.4), 0.06, 0.24),
      tipChordM: this.clamp((parent?.tipChordM ?? base.finSet.tipChordM) * (0.75 + random() * 0.5), 0.02, 0.14),
      fitness: Number.NEGATIVE_INFINITY
    });
    let population = Array.from({ length: populationSize }, () => make());
    let evaluations = 0;
    let bestConfig = this.copy(base);
    let bestApogee = 0;
    let bestStability = 0;
    let bestFitness = Number.NEGATIVE_INFINITY;
    for (let generation = 0; generation < generations; generation++) {
      for (const candidate of population) {
        const config = this.apply(base, candidate);
        const stability = BarrowmanAerodynamicsSolver.calculate(config).stabilityMarginCalibers;
        const flight = RocketTrajectoryPredictor.simulateFlight(config);
        evaluations++;
        const apogeeError = Math.abs(flight.apogeeAltitudeM - goal.targetApogeeM) / Math.max(goal.targetApogeeM, 1);
        const stabilityPenalty = Math.max(0, goal.minimumStabilityCalibers - stability) * 1.8;
        const overstablePenalty = Math.max(0, stability - 2.5) * 0.5;
        candidate.fitness = 1 - apogeeError - stabilityPenalty - overstablePenalty;
        if (candidate.fitness > bestFitness) {
          bestFitness = candidate.fitness;
          bestConfig = config;
          bestApogee = flight.apogeeAltitudeM;
          bestStability = stability;
        }
      }
      population.sort((a, b) => b.fitness - a.fitness);
      const winner = population[0];
      const elite = population.slice(0, Math.max(2, Math.floor(populationSize / 3)));
      population = [winner, ...Array.from({ length: populationSize - 1 }, (_, index) => make(elite[index % elite.length]))];
    }
    const apogeeError = Math.abs(bestApogee - goal.targetApogeeM) / Math.max(goal.targetApogeeM, 1);
    const finalFitness = 1 - apogeeError - Math.max(0, goal.minimumStabilityCalibers - bestStability) * 1.8;
    return { config: bestConfig, apogeeM: bestApogee, stabilityCalibers: bestStability, fitness: finalFitness, evaluations, generations };
  }

  private static apply(base: RocketAeroConfig, candidate: Candidate): RocketAeroConfig {
    const config = this.copy(base);
    config.noseCone.lengthM = candidate.noseLengthM;
    config.finSet.spanM = candidate.finSpanM;
    config.finSet.rootChordM = candidate.rootChordM;
    config.finSet.tipChordM = Math.min(candidate.tipChordM, candidate.rootChordM * 0.9);
    config.finSet.positionFromNoseM = config.noseCone.lengthM + config.bodyTube.lengthM - config.finSet.rootChordM;
    const baseFinArea = base.finSet.numFins * base.finSet.spanM * (base.finSet.rootChordM + base.finSet.tipChordM) * 0.5;
    const finArea = config.finSet.numFins * config.finSet.spanM * (config.finSet.rootChordM + config.finSet.tipChordM) * 0.5;
    config.finSet.massKg = base.finSet.massKg * finArea / Math.max(baseFinArea, 1e-6);
    config.noseCone.massKg = base.noseCone.massKg * config.noseCone.lengthM / Math.max(base.noseCone.lengthM, 1e-6);
    const referenceArea = Math.PI * Math.pow(config.bodyTube.outerDiameterM / 2, 2);
    const fineness = config.noseCone.lengthM / Math.max(config.bodyTube.outerDiameterM, 1e-4);
    config.cadReferenceAreaM2 = referenceArea;
    config.cadEstimatedCd = this.clamp(0.16 + 0.65 / Math.max(fineness, 1) + 0.02 * finArea / referenceArea, 0.18, 0.8);
    return config;
  }

  private static copy(config: RocketAeroConfig): RocketAeroConfig {
    return { ...config, noseCone: { ...config.noseCone }, bodyTube: { ...config.bodyTube }, finSet: { ...config.finSet } };
  }

  private static clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
}
