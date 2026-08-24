import { PartGraph } from './part-graph.js';

export type SimulationExportFormat = 'gazebo' | 'moveit' | 'isaac';

export interface SimulationExport {
  filename: string;
  mimeType: string;
  data: string;
}

export class SimulationExporter {
  public static export(graph: PartGraph, format: SimulationExportFormat): SimulationExport {
    if (format === 'gazebo') return this.gazebo(graph);
    if (format === 'moveit') return this.moveIt(graph);
    return this.isaacUsd(graph);
  }

  private static gazebo(graph: PartGraph): SimulationExport {
    const links = Array.from(graph.assembly.parts.values()).map(part => {
      const def = graph.getDefinition(part.definitionId);
      const size = def?.dimensions ?? [0.1, 0.1, 0.1];
      return `    <link name="${this.safe(part.instanceId)}"><pose>${part.position.join(' ')} 0 0 0</pose><inertial><mass>${def?.massKg ?? 0.1}</mass></inertial><collision name="collision"><geometry><box><size>${size.join(' ')}</size></box></geometry></collision><visual name="visual"><geometry><box><size>${size.join(' ')}</size></box></geometry></visual></link>`;
    }).join('\n');
    return { filename: `${this.safe(graph.assembly.name)}.world`, mimeType: 'application/xml', data: `<?xml version="1.0"?>\n<sdf version="1.9">\n  <world name="astrodyne"><model name="${this.safe(graph.assembly.name)}">\n${links}\n  </model></world>\n</sdf>` };
  }

  private static moveIt(graph: PartGraph): SimulationExport {
    const joints = Array.from(graph.assembly.parts.values()).map((part, index) => `  - name: joint_${index + 1}\n    child_link: ${this.safe(part.instanceId)}\n    default: 0.0`).join('\n');
    return { filename: `${this.safe(graph.assembly.name)}_moveit.yaml`, mimeType: 'text/yaml', data: `robot_description: ${this.safe(graph.assembly.name)}\nplanning_group: complete_assembly\njoints:\n${joints || '  []'}\nkinematics_solver: kdl_kinematics_plugin/KDLKinematicsPlugin\n` };
  }

  private static isaacUsd(graph: PartGraph): SimulationExport {
    const prims = Array.from(graph.assembly.parts.values()).map(part => {
      const def = graph.getDefinition(part.definitionId);
      return `    def Cube "${this.safe(part.instanceId)}" {\n        double3 xformOp:translate = (${part.position.join(', ')})\n        double3 xformOp:scale = (${(def?.dimensions ?? [0.1, 0.1, 0.1]).map(v => v / 2).join(', ')})\n        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]\n    }`;
    }).join('\n');
    return { filename: `${this.safe(graph.assembly.name)}.usda`, mimeType: 'text/plain', data: `#usda 1.0\n(\n    defaultPrim = "Assembly"\n    upAxis = "Y"\n)\ndef Xform "Assembly" {\n${prims}\n}\n` };
  }

  private static safe(value: string): string {
    return value.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
