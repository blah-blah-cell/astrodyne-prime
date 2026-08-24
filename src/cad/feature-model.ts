export type CADPrimitiveType = 'box' | 'cylinder' | 'sphere';
export type CADBooleanOperation = 'union' | 'subtract' | 'intersect';

export interface CADFeature {
  id: string;
  name: string;
  type: CADPrimitiveType;
  operation: CADBooleanOperation;
  enabled: boolean;
  dimensions: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  segments: number;
}

export class CADFeatureModel {
  static create(type: CADPrimitiveType, index: number): CADFeature {
    const defaults: Record<CADPrimitiveType, [number, number, number]> = {
      box: [40, 40, 10],
      cylinder: [12, 12, 40],
      sphere: [20, 20, 20]
    };
    return {
      id: `feature-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${type[0].toUpperCase()}${type.slice(1)} ${index}`,
      type,
      operation: 'union',
      enabled: true,
      dimensions: defaults[type],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      segments: 64
    };
  }

  static toScript(features: CADFeature[]): string {
    const enabled = features.filter(feature => feature.enabled);
    if (!enabled.length) return 'return cube([0.1, 0.1, 0.1], true);';
    const lines = ['// Generated from the editable CAD feature history'];
    enabled.forEach((feature, index) => {
      const variable = `f${index}`;
      const [x, y, z] = feature.dimensions;
      const primitive = feature.type === 'box'
        ? `cube([${x}, ${y}, ${z}], true)`
        : feature.type === 'cylinder'
        ? `cylinder(${z}, ${x}, ${y}, ${Math.max(8, Math.round(feature.segments))}, true)`
        : `scale(sphere(${x}, ${Math.max(8, Math.round(feature.segments))}), [1, ${y / x}, ${z / x}])`;
      lines.push(`let ${variable} = ${primitive};`);
      if (feature.rotation.some(value => value !== 0)) lines.push(`${variable} = rotate(${variable}, [${feature.rotation.join(', ')}]);`);
      if (feature.position.some(value => value !== 0)) lines.push(`${variable} = translate(${variable}, [${feature.position.join(', ')}]);`);
      if (index === 0) lines.push(`let result = ${variable};`);
      else if (feature.operation === 'subtract') lines.push(`result = difference(result, ${variable});`);
      else if (feature.operation === 'intersect') lines.push(`result = intersection(result, ${variable});`);
      else lines.push(`result = union(result, ${variable});`);
    });
    lines.push('return result;');
    return lines.join('\n');
  }
}
