export interface BatterySpec {
  nominalVoltageV: number;
  capacityAh: number;
  internalResistanceOhm: number;
  stateOfCharge: number;
}

export interface PowerBusLoad {
  name: string;
  currentA: number;
  enabled?: boolean;
}

export interface PowerBusResult {
  openCircuitVoltageV: number;
  busVoltageV: number;
  loadCurrentA: number;
  solarCurrentA: number;
  netCurrentA: number;
  powerW: number;
  runtimeHours: number;
  brownout: boolean;
}

export class ElectricalPowerBus {
  public static motorCurrent(torqueNm: number, torqueConstantNmPerA: number, idleCurrentA = 0.25): number {
    if (torqueConstantNmPerA <= 0) throw new Error('Motor torque constant must be positive');
    return Math.abs(torqueNm) / torqueConstantNmPerA + idleCurrentA;
  }

  public static solarPower(panelAreaM2: number, efficiency: number, incidenceAngleDeg: number, irradianceWm2 = 1000): number {
    const incidence = Math.max(0, Math.cos(incidenceAngleDeg * Math.PI / 180));
    return Math.max(0, panelAreaM2) * Math.max(0, Math.min(1, efficiency)) * irradianceWm2 * incidence;
  }

  public static evaluate(battery: BatterySpec, loads: PowerBusLoad[], solarPowerW = 0, brownoutVoltageV?: number): PowerBusResult {
    const soc = Math.max(0, Math.min(1, battery.stateOfCharge));
    const openCircuitVoltageV = battery.nominalVoltageV * (0.88 + 0.12 * soc);
    const loadCurrentA = loads.filter(load => load.enabled !== false).reduce((sum, load) => sum + Math.max(0, load.currentA), 0);
    const solarCurrentA = solarPowerW / Math.max(openCircuitVoltageV, 0.1);
    const netCurrentA = Math.max(0, loadCurrentA - solarCurrentA);
    const busVoltageV = Math.max(0, openCircuitVoltageV - netCurrentA * battery.internalResistanceOhm);
    const threshold = brownoutVoltageV ?? battery.nominalVoltageV * 0.78;
    return {
      openCircuitVoltageV,
      busVoltageV,
      loadCurrentA,
      solarCurrentA,
      netCurrentA,
      powerW: busVoltageV * loadCurrentA,
      runtimeHours: netCurrentA > 1e-6 ? battery.capacityAh * soc / netCurrentA : Number.POSITIVE_INFINITY,
      brownout: busVoltageV < threshold
    };
  }
}
