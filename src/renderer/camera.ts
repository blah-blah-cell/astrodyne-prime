export class Camera {
  public target: [number, number, number] = [0, 0, 0];
  public distance = 400;
  public minDistance = 5;
  public maxDistance = 5000;

  public azimuth = Math.PI * 0.25; // horizontal angle
  public elevation = Math.PI * 0.2; // vertical angle

  private targetAzimuth = Math.PI * 0.25;
  private targetElevation = Math.PI * 0.2;
  private targetDistance = 400;
  private targetCenter: [number, number, number] = [0, 0, 0];

  public fov = (55 * Math.PI) / 180;
  public aspect = 1.0;
  public near = 1.0;
  public far = 10000.0;

  // Matrices (16 floats column-major)
  public viewMatrix = new Float32Array(16);
  public projMatrix = new Float32Array(16);
  public viewProjMatrix = new Float32Array(16);
  public invViewMatrix = new Float32Array(16);
  public invViewProjMatrix = new Float32Array(16);
  public eyePos = new Float32Array(4);

  // Interaction State
  private isDragging = false;
  private isPanning = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  public trackTarget = false;

  constructor(aspect = 1.0, distance = 400) {
    this.aspect = aspect;
    this.distance = distance;
    this.targetDistance = distance;
    this.updateMatrices();
  }

  public resize(width: number, height: number): void {
    this.aspect = width / Math.max(height, 1);
    this.updateMatrices();
  }

  public setDistance(dist: number): void {
    this.distance = dist;
    this.targetDistance = dist;
  }

  public setTarget(x: number, y: number, z: number): void {
    this.targetCenter = [x, y, z];
  }

  public update(damping = 0.15): void {
    // Smooth damping
    this.azimuth += (this.targetAzimuth - this.azimuth) * damping;
    this.elevation += (this.targetElevation - this.elevation) * damping;
    this.distance += (this.targetDistance - this.distance) * damping;

    if (this.trackTarget) {
      this.target[0] += (this.targetCenter[0] - this.target[0]) * damping;
      this.target[1] += (this.targetCenter[1] - this.target[1]) * damping;
      this.target[2] += (this.targetCenter[2] - this.target[2]) * damping;
    }

    this.updateMatrices();
  }

  public attachControls(canvas: HTMLCanvasElement, allowInteraction: () => boolean): void {
    canvas.addEventListener('mousedown', (e) => {
      if (!allowInteraction()) return;
      if (e.button === 0) { // Left click
        this.isDragging = true;
      } else if (e.button === 2) { // Right click
        this.isPanning = true;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging && !this.isPanning) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.isDragging) {
        this.targetAzimuth -= dx * 0.006;
        this.targetElevation = Math.max(
          -Math.PI * 0.49,
          Math.min(Math.PI * 0.49, this.targetElevation - dy * 0.006)
        );
      } else if (this.isPanning) {
        const panSpeed = this.distance * 0.0015;
        const camRight = [this.invViewMatrix[0], this.invViewMatrix[1], this.invViewMatrix[2]];
        const camUp = [this.invViewMatrix[4], this.invViewMatrix[5], this.invViewMatrix[6]];

        this.target[0] -= (camRight[0] * dx - camUp[0] * dy) * panSpeed;
        this.target[1] -= (camRight[1] * dx - camUp[1] * dy) * panSpeed;
        this.target[2] -= (camRight[2] * dx - camUp[2] * dy) * panSpeed;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isPanning = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = Math.exp(e.deltaY * 0.001);
      this.targetDistance = Math.max(
        this.minDistance,
        Math.min(this.maxDistance, this.targetDistance * zoomFactor)
      );
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Raycasts screen mouse (x, y) to galactic plane (y = 0)
  public screenToWorldPlane(screenX: number, screenY: number, width: number, height: number): [number, number, number] | null {
    const ndcX = (screenX / width) * 2.0 - 1.0;
    const ndcY = 1.0 - (screenY / height) * 2.0;

    const near = this.unprojectPoint(ndcX, ndcY, 0.0);
    const far = this.unprojectPoint(ndcX, ndcY, 1.0);

    const dir = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
    if (Math.abs(dir[1]) < 1e-6) return null;

    const t = -near[1] / dir[1];
    return [near[0] + dir[0] * t, 0, near[2] + dir[2] * t];
  }

  private unprojectPoint(x: number, y: number, z: number): [number, number, number] {
    const m = this.invViewProjMatrix;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const invW = 1.0 / (w === 0 ? 1.0 : w);
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * invW,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * invW,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * invW
    ];
  }

  private updateMatrices(): void {
    const cosElev = Math.cos(this.elevation);
    const sinElev = Math.sin(this.elevation);
    const cosAzim = Math.cos(this.azimuth);
    const sinAzim = Math.sin(this.azimuth);

    const eyeX = this.target[0] + this.distance * cosElev * sinAzim;
    const eyeY = this.target[1] + this.distance * sinElev;
    const eyeZ = this.target[2] + this.distance * cosElev * cosAzim;

    this.eyePos[0] = eyeX;
    this.eyePos[1] = eyeY;
    this.eyePos[2] = eyeZ;
    this.eyePos[3] = 1.0;

    // LookAt
    this.lookAt(
      [eyeX, eyeY, eyeZ],
      this.target,
      [0, 1, 0],
      this.viewMatrix
    );

    // Perspective
    this.perspective(this.fov, this.aspect, this.near, this.far, this.projMatrix);

    // View-Projection
    this.multiplyMatrices(this.projMatrix, this.viewMatrix, this.viewProjMatrix);

    // Invert View
    this.invertMatrix(this.viewMatrix, this.invViewMatrix);

    // Invert View-Projection
    this.invertMatrix(this.viewProjMatrix, this.invViewProjMatrix);
  }

  private lookAt(eye: number[], center: number[], up: number[], out: Float32Array): void {
    let z0 = eye[0] - center[0];
    let z1 = eye[1] - center[1];
    let z2 = eye[2] - center[2];
    let len = Math.hypot(z0, z1, z2);
    if (len === 0) len = 1;
    z0 /= len; z1 /= len; z2 /= len;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (len === 0) len = 1;
    x0 /= len; x1 /= len; x2 /= len;

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
    out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
    out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
    out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    out[15] = 1;
  }

  private perspective(fov: number, aspect: number, near: number, far: number, out: Float32Array): void {
    const f = 1.0 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = far * nf;
    out[11] = -1;
    out[14] = far * near * nf;
  }

  private multiplyMatrices(a: Float32Array, b: Float32Array, out: Float32Array): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[k * 4 + i] * b[j * 4 + k];
        }
        out[j * 4 + i] = sum;
      }
    }
  }

  private invertMatrix(m: Float32Array, out: Float32Array): void {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return;
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  }
}
