import { DHParameter } from './kinematics-solver.js';

export class URDFGenerator {
  /**
   * Generates standard ROS URDF XML for a robotic arm or rover structure.
   */
  public static generateURDF(robotName: string, links: { name: string; massKg: number; size: [number, number, number] }[], joints: DHParameter[]): string {
    let xml = `<?xml version="1.0"?>\n<robot name="${robotName}">\n`;

    // Base link
    xml += `  <link name="base_link">\n`;
    xml += `    <visual>\n      <geometry>\n        <cylinder length="0.05" radius="0.1"/>\n      </geometry>\n    </visual>\n`;
    xml += `    <inertial>\n      <mass value="2.0"/>\n    </inertial>\n`;
    xml += `  </link>\n`;

    let parentLink = 'base_link';

    for (let i = 0; i < joints.length; i++) {
      const j = joints[i];
      const linkName = links[i]?.name || `link_${i + 1}`;
      const mass = links[i]?.massKg || 0.5;

      // Link
      xml += `  <link name="${linkName}">\n`;
      xml += `    <visual>\n      <geometry>\n        <cylinder length="${j.aM || 0.2}" radius="0.03"/>\n      </geometry>\n    </visual>\n`;
      xml += `    <inertial>\n      <mass value="${mass}"/>\n    </inertial>\n`;
      xml += `  </link>\n`;

      // Joint
      xml += `  <joint name="joint_${i + 1}" type="${j.jointType}">\n`;
      xml += `    <parent link="${parentLink}"/>\n`;
      xml += `    <child link="${linkName}"/>\n`;
      xml += `    <origin xyz="${j.aM} 0 ${j.dM}" rpy="${j.alphaDeg * (Math.PI / 180)} 0 0"/>\n`;
      xml += `    <axis xyz="0 0 1"/>\n`;
      if (j.minLimitDeg !== undefined && j.maxLimitDeg !== undefined) {
        xml += `    <limit lower="${j.minLimitDeg * (Math.PI / 180)}" upper="${j.maxLimitDeg * (Math.PI / 180)}" effort="10.0" velocity="3.14"/>\n`;
      }
      xml += `  </joint>\n`;

      parentLink = linkName;
    }

    xml += `</robot>\n`;
    return xml;
  }
}
