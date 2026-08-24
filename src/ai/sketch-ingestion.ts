export interface SketchAnalysis {
  width: number;
  height: number;
  edgeDensity: number;
  symmetry: number;
  classification: 'ROCKET' | 'ROVER' | 'MECHANICAL_PART';
  cadScript: string;
}

export class EngineeringSketchIngestion {
  public static analyze(image: ImageData): SketchAnalysis {
    const { width, height, data } = image;
    let edges = 0;
    let symmetryMatches = 0;
    let symmetrySamples = 0;
    const luminance = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    };
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const gradient = Math.abs(luminance(x + 1, y) - luminance(x - 1, y)) + Math.abs(luminance(x, y + 1) - luminance(x, y - 1));
        if (gradient > 70) edges++;
        if (x < width / 2) {
          if (Math.abs(luminance(x, y) - luminance(width - 1 - x, y)) < 35) symmetryMatches++;
          symmetrySamples++;
        }
      }
    }
    const samples = Math.max(1, Math.floor((width - 2) / 2) * Math.floor((height - 2) / 2));
    const edgeDensity = edges / samples;
    const symmetry = symmetryMatches / Math.max(symmetrySamples, 1);
    const aspect = height / Math.max(width, 1);
    const classification = aspect > 1.35 && symmetry > 0.55 ? 'ROCKET' : aspect < 0.8 ? 'ROVER' : 'MECHANICAL_PART';
    const cadScript = classification === 'ROCKET'
      ? 'let body = cylinder(80, 15, 15, 48, false);\nlet nose = translate(cylinder(35, 15, 0.5, 48, false), [0, 0, 80]);\nreturn union(body, nose);'
      : classification === 'ROVER'
      ? 'let chassis = cube([80, 35, 12], true);\nlet bay = translate(cube([45, 22, 8], true), [0, 0, 5]);\nreturn difference(chassis, bay);'
      : 'let shell = cube([50, 50, 10], true);\nlet bore = cylinder(14, 12, 12, 40, true);\nreturn difference(shell, bore);';
    return { width, height, edgeDensity, symmetry, classification, cadScript };
  }
}
