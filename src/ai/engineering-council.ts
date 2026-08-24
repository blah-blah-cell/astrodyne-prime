import { PartGraph } from '../builder/part-graph.js';

export type EngineeringRole = 'Aerodynamicist' | 'Structural Engineer' | 'Systems Architect' | 'Flight Director';

export interface CouncilFinding {
  role: EngineeringRole;
  severity: 'INFO' | 'ADVISORY' | 'CRITICAL';
  finding: string;
  action: string;
}

export interface CouncilReport {
  score: number;
  findings: CouncilFinding[];
  summary: string;
}

export class EngineeringCouncil {
  public static review(graph: PartGraph): CouncilReport {
    let thrustN = 0;
    let aeroParts = 0;
    let motors = 0;
    let batteries = 0;
    let structural = 0;
    for (const part of graph.assembly.parts.values()) {
      const def = graph.getDefinition(part.definitionId);
      thrustN += def?.properties?.thrustN ?? 0;
      if (def?.properties?.dragCoefficientCd !== undefined) aeroParts++;
      if (def?.properties?.stallTorqueNm) motors++;
      if (def?.properties?.batteryCapacityAh) batteries++;
      if (def?.category === 'STRUCTURAL') structural++;
    }
    const mass = graph.assembly.totalMassKg;
    const findings: CouncilFinding[] = [];
    findings.push({
      role: 'Aerodynamicist', severity: aeroParts >= 3 ? 'INFO' : 'ADVISORY',
      finding: `${aeroParts} aerodynamic components detected.`,
      action: aeroParts >= 3 ? 'Validate trim across the Max-Q envelope.' : 'Add at least three symmetric control surfaces.'
    });
    findings.push({
      role: 'Structural Engineer', severity: structural > 0 ? 'INFO' : 'CRITICAL',
      finding: `${structural} structural load-path components support ${mass.toFixed(2)} kg.`,
      action: structural > 0 ? 'Inspect high-moment socket joints before export.' : 'Add a structural frame before simulation.'
    });
    findings.push({
      role: 'Systems Architect', severity: motors === 0 || batteries > 0 ? 'INFO' : 'CRITICAL',
      finding: `${motors} electrical motors and ${batteries} batteries are installed.`,
      action: motors > 0 && batteries === 0 ? 'Install a compatible power source.' : 'Power architecture is internally consistent.'
    });
    const twr = mass > 0 ? thrustN / (mass * 9.80665) : 0;
    findings.push({
      role: 'Flight Director', severity: thrustN === 0 || twr > 1.2 ? 'INFO' : 'CRITICAL',
      finding: thrustN > 0 ? `Sea-level thrust-to-weight ratio is ${twr.toFixed(2)}.` : 'No launch propulsion installed.',
      action: thrustN > 0 && twr <= 1.2 ? 'Increase thrust or reduce liftoff mass.' : 'Run a full mission profile before release.'
    });
    const deductions = findings.reduce((sum, item) => sum + (item.severity === 'CRITICAL' ? 22 : item.severity === 'ADVISORY' ? 8 : 0), 0);
    const score = Math.max(0, 100 - deductions);
    return { score, findings, summary: score >= 85 ? 'DESIGN READY FOR VERIFICATION' : score >= 60 ? 'REVISIONS RECOMMENDED' : 'DESIGN HOLD' };
  }
}
