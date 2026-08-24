import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DHParameter, DHKinematicsSolver } from './kinematics-solver.js';
import { URDFGenerator } from './urdf-generator.js';
import { IKAlgorithm, InverseKinematicsSolver } from './inverse-kinematics.js';
import { EngineeringMeasurements } from '../engineering/measurements.js';
import { EngineeringProjectSession } from '../engineering/project-session.js';

export class RoboticsStudioView {
  private container: HTMLElement;
  private dhChain: DHParameter[];

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private armGroup: THREE.Group;
  private ikTarget: [number, number, number] = [0.45, 0.25, 0.25];
  private targetMarker: THREE.Mesh;
  private draggingTarget = false;
  private dragPlane = new THREE.Plane();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private editable(value: number, precision = 3): string {
    return Number(value.toFixed(precision)).toString();
  }

  private jointControlsHTML(): string {
    return this.dhChain.map((joint, index) => `
      <div class="dh-joint-slider-group">
        <div class="dh-label-row"><span class="dh-joint-name">Joint ${index + 1}: ${joint.name}</span><span class="dh-joint-val" id="val-joint-${index}">${this.editable(joint.thetaDeg, 2)}°</span></div>
        <input type="range" id="slider-joint-${index}" min="${joint.minLimitDeg ?? -180}" max="${joint.maxLimitDeg ?? 180}" value="${this.editable(joint.thetaDeg, 3)}" step="0.1" class="form-range">
        <div class="dh-parameter-grid">
          <label>Name<input class="form-input" data-dh-field="name" data-joint="${index}" value="${joint.name}"></label>
          <label>θ (deg)<input class="form-input" type="number" data-dh-field="thetaDeg" data-joint="${index}" value="${this.editable(joint.thetaDeg, 3)}" step="0.1"></label>
          <label>d (m)<input class="form-input" type="number" data-dh-field="dM" data-joint="${index}" value="${this.editable(joint.dM)}" step="0.001"></label>
          <label>a (m)<input class="form-input" type="number" data-dh-field="aM" data-joint="${index}" value="${this.editable(joint.aM)}" step="0.001"></label>
          <label>α (deg)<input class="form-input" type="number" data-dh-field="alphaDeg" data-joint="${index}" value="${this.editable(joint.alphaDeg, 2)}" step="0.1"></label>
          <label>Min (deg)<input class="form-input" type="number" data-dh-field="minLimitDeg" data-joint="${index}" value="${joint.minLimitDeg ?? -180}" step="1"></label>
          <label>Max (deg)<input class="form-input" type="number" data-dh-field="maxLimitDeg" data-joint="${index}" value="${joint.maxLimitDeg ?? 180}" step="1"></label>
        </div>
      </div>`).join('');
  }

  constructor(container: HTMLElement) {
    this.container = container;

    // Standard 6-DOF Industrial / Spacecraft Robotic Arm DH Parameters
    this.dhChain = [
      { name: 'Base Yaw (J1)', thetaDeg: 0, dM: 0.2, aM: 0.0, alphaDeg: 90, jointType: 'revolute', minLimitDeg: -180, maxLimitDeg: 180 },
      { name: 'Shoulder Pitch (J2)', thetaDeg: 45, dM: 0.0, aM: 0.4, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -90, maxLimitDeg: 120 },
      { name: 'Elbow Pitch (J3)', thetaDeg: -60, dM: 0.0, aM: 0.35, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -150, maxLimitDeg: 150 },
      { name: 'Wrist Roll (J4)', thetaDeg: 0, dM: 0.1, aM: 0.0, alphaDeg: 90, jointType: 'revolute', minLimitDeg: -180, maxLimitDeg: 180 },
      { name: 'Wrist Pitch (J5)', thetaDeg: 30, dM: 0.0, aM: 0.0, alphaDeg: -90, jointType: 'revolute', minLimitDeg: -110, maxLimitDeg: 110 },
      { name: 'End-Effector Roll (J6)', thetaDeg: 0, dM: 0.15, aM: 0.0, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -360, maxLimitDeg: 360 }
    ];
    const savedChain = (EngineeringProjectSession.get().artifacts.robotics?.data as { chain?: DHParameter[] } | undefined)?.chain;
    if (Array.isArray(savedChain) && savedChain.length) this.dhChain = structuredClone(savedChain);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f4f6);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 50);
    this.camera.position.set(1.5, 1.2, 1.8);
    this.camera.lookAt(0, 0.4, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 12;
    this.armGroup = new THREE.Group();
    this.scene.add(this.armGroup);
    this.targetMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.8 })
    );
    this.targetMarker.position.set(...this.ikTarget);
    this.scene.add(this.targetMarker);

    this.initLightsAndGrid();
    this.renderUI();
  }

  private initLightsAndGrid(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const grid = new THREE.GridHelper(4, 20, 0xaab4bf, 0xd9dee5);
    this.scene.add(grid);
  }

  private renderUI(): void {
    this.container.innerHTML = `
      <div class="robotics-studio-layout">
        <!-- Left DH & Joint Control Panel -->
        <div class="robotics-control-panel">
          <div class="robotics-header">
            <div class="robotics-title">Robotics Kinematics</div>
            <div class="robotics-badge" id="robotics-dof-badge">Three.js · DH · URDF · ${this.dhChain.length} DOF</div>
          </div>

          <div class="cad-feature-toolbar">
            <button id="btn-apply-dh" class="primary-btn">Apply DH Table</button>
            <button id="btn-add-joint" class="secondary-btn">Add Joint</button>
            <button id="btn-remove-joint" class="danger-btn">Remove Last</button>
          </div>
          <div class="dh-joint-list" id="dh-joint-list">
            ${this.jointControlsHTML()}
          </div>

          <!-- End Effector Telemetry -->
          <div class="robotics-telem-box">
            <div class="aero-card-title">End-Effector Pose (XYZ / RPY)</div>
            <div class="cad-telem-row"><span>Position [X, Y, Z]:</span> <b id="val-ee-pos">[0.00, 0.00, 0.00] m</b></div>
            <div class="cad-telem-row"><span>Orientation [R, P, Y]:</span> <b id="val-ee-rot">[0.0°, 0.0°, 0.0°]</b></div>
          </div>

          <div class="robotics-telem-box ik-control-box">
            <div class="aero-card-title">Inverse Kinematics Target · metres</div>
            <div class="aero-grid-3">
              <input id="ik-target-x" class="form-input" type="number" value="0.45" step="0.05" aria-label="IK target X">
              <input id="ik-target-y" class="form-input" type="number" value="0.25" step="0.05" aria-label="IK target Y">
              <input id="ik-target-z" class="form-input" type="number" value="0.25" step="0.05" aria-label="IK target Z">
            </div>
            <select id="ik-algorithm" class="form-select" aria-label="IK algorithm">
              <option value="dls">Damped Least Squares</option>
              <option value="jacobian-transpose">Jacobian Transpose</option>
              <option value="fabrik">FABRIK Constrained</option>
            </select>
            <button id="btn-solve-ik" class="btn-rocketry-run">Solve IK Target</button>
            <div class="cad-telem-row"><span>Solver status:</span> <b id="ik-status">READY</b></div>
          </div>

          <button id="btn-export-urdf" class="btn-cad-export">Export ROS URDF</button>
        </div>

        <!-- Right 3D Viewport -->
        <div class="robotics-viewport-wrapper" id="robotics-canvas-container">
          <div class="cad-view-toolbar robotics-view-toolbar" aria-label="Robotics camera controls">
            <button id="robot-view-fit">Fit</button><button id="robot-view-iso">Iso</button><button id="robot-view-front">Front</button><button id="robot-view-top">Top</button>
          </div>
        </div>
      </div>
    `;

    const canvasContainer = this.container.querySelector('#robotics-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.appendChild(this.renderer.domElement);
      this.resize();
    }

    this.attachEvents();
    this.updateKinematics();
    requestAnimationFrame(() => this.frameRobot());
  }

  private attachEvents(): void {
    this.bindJointEvents();
    this.bindExportAndIKEvents();
    this.container.querySelector('#btn-apply-dh')?.addEventListener('click', () => this.applyDHTable());
    this.container.querySelector('#btn-add-joint')?.addEventListener('click', () => {
      const index = this.dhChain.length + 1;
      this.dhChain.push({ name: `Joint ${index}`, thetaDeg: 0, dM: 0, aM: 0.2, alphaDeg: 0, jointType: 'revolute', minLimitDeg: -180, maxLimitDeg: 180 });
      this.refreshJointControls(); this.updateKinematics();
    });
    this.container.querySelector('#btn-remove-joint')?.addEventListener('click', () => { if (this.dhChain.length > 1) { this.dhChain.pop(); this.refreshJointControls(); this.updateKinematics(); } });
    this.container.querySelector('#robot-view-fit')?.addEventListener('click', () => this.frameRobot());
    this.container.querySelector('#robot-view-iso')?.addEventListener('click', () => this.setCameraView('iso'));
    this.container.querySelector('#robot-view-front')?.addEventListener('click', () => this.setCameraView('front'));
    this.container.querySelector('#robot-view-top')?.addEventListener('click', () => this.setCameraView('top'));
  }

  private bindJointEvents(): void {
    this.dhChain.forEach((_, i) => {
      const slider = this.container.querySelector(`#slider-joint-${i}`) as HTMLInputElement;
      const valLabel = this.container.querySelector(`#val-joint-${i}`);
      slider?.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.dhChain[i].thetaDeg = v;
        if (valLabel) valLabel.textContent = `${v}°`;
        const thetaInput = this.container.querySelector(`[data-dh-field="thetaDeg"][data-joint="${i}"]`) as HTMLInputElement | null;
        if (thetaInput) thetaInput.value = String(v);
        this.updateKinematics();
      });
    });
  }

  private refreshJointControls(): void {
    const list = this.container.querySelector('#dh-joint-list'); if (!list) return;
    list.innerHTML = this.jointControlsHTML(); this.bindJointEvents();
    const badge = this.container.querySelector('#robotics-dof-badge');
    if (badge) badge.textContent = `Three.js · DH · URDF · ${this.dhChain.length} DOF`;
  }

  private applyDHTable(): void {
    this.container.querySelectorAll('[data-dh-field]').forEach(element => {
      const input = element as HTMLInputElement; const index = Number(input.dataset.joint); const field = input.dataset.dhField as keyof DHParameter;
      if (!this.dhChain[index] || field === 'jointType') return;
      if (field === 'name') this.dhChain[index].name = input.value.trim() || `Joint ${index + 1}`;
      else { const value = Number(input.value); if (Number.isFinite(value)) (this.dhChain[index] as unknown as Record<string, number>)[field] = value; }
    });
    this.dhChain.forEach(joint => { if ((joint.minLimitDeg ?? -180) > (joint.maxLimitDeg ?? 180)) [joint.minLimitDeg, joint.maxLimitDeg] = [joint.maxLimitDeg, joint.minLimitDeg]; joint.thetaDeg = Math.max(joint.minLimitDeg ?? -180, Math.min(joint.maxLimitDeg ?? 180, joint.thetaDeg)); });
    this.refreshJointControls(); this.updateKinematics();
  }

  private bindExportAndIKEvents(): void {

    const btnUrdf = this.container.querySelector('#btn-export-urdf');
    const btnSolve = this.container.querySelector('#btn-solve-ik');
    btnSolve?.addEventListener('click', () => this.solveIKTarget());
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', event => this.beginTargetDrag(event));
    canvas.addEventListener('pointermove', event => this.moveTargetDrag(event));
    canvas.addEventListener('pointerup', () => { this.draggingTarget = false; this.controls.enabled = true; });
    canvas.addEventListener('pointerleave', () => { this.draggingTarget = false; this.controls.enabled = true; });
    btnUrdf?.addEventListener('click', () => {
      const links = this.dhChain.map((j, i) => ({ name: `arm_link_${i + 1}`, massKg: 0.6, size: [0.05, 0.05, j.aM || 0.2] as [number, number, number] }));
      const xml = URDFGenerator.generateURDF(`Astrodyne_${this.dhChain.length}DOF_Manipulator`, links, this.dhChain);
      const blob = new Blob([xml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `astrodyne_${this.dhChain.length}dof_robot.urdf`;
      a.click();
      URL.revokeObjectURL(url);
    });

    window.addEventListener('resize', () => this.resize());
  }

  private updatePointer(event: PointerEvent): void {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 2 - 1,
      -((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private beginTargetDrag(event: PointerEvent): void {
    this.updatePointer(event);
    if (!this.raycaster.intersectObject(this.targetMarker).length) return;
    this.draggingTarget = true;
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    this.dragPlane.setFromNormalAndCoplanarPoint(cameraDirection, this.targetMarker.position);
  }

  private moveTargetDrag(event: PointerEvent): void {
    if (!this.draggingTarget) return;
    this.updatePointer(event);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, point)) return;
    point.clamp(new THREE.Vector3(-1.5, -0.2, -1.5), new THREE.Vector3(1.5, 1.5, 1.5));
    const ids = ['#ik-target-x', '#ik-target-y', '#ik-target-z'];
    [point.x, point.y, point.z].forEach((coordinate, index) => {
      const input = this.container.querySelector(ids[index]) as HTMLInputElement | null;
      if (input) input.value = coordinate.toFixed(3);
    });
    this.solveIKTarget();
  }

  public solveIKTarget(): void {
    const value = (id: string, fallback: number) => {
      const parsed = Number((this.container.querySelector(id) as HTMLInputElement | null)?.value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    this.ikTarget = [value('#ik-target-x', 0.45), value('#ik-target-y', 0.25), value('#ik-target-z', 0.25)];
    const algorithm = ((this.container.querySelector('#ik-algorithm') as HTMLSelectElement | null)?.value ?? 'dls') as IKAlgorithm;
    const result = InverseKinematicsSolver.solve(this.dhChain, this.ikTarget, { algorithm });
    this.dhChain = result.chain;
    this.targetMarker.position.set(...this.ikTarget);
    this.dhChain.forEach((joint, index) => {
      const slider = this.container.querySelector(`#slider-joint-${index}`) as HTMLInputElement | null;
      const label = this.container.querySelector(`#val-joint-${index}`);
      if (slider) slider.value = joint.thetaDeg.toFixed(2);
      if (label) label.textContent = `${joint.thetaDeg.toFixed(1)}°`;
      const thetaInput = this.container.querySelector(`[data-dh-field="thetaDeg"][data-joint="${index}"]`) as HTMLInputElement | null;
      if (thetaInput) thetaInput.value = this.editable(joint.thetaDeg, 3);
    });
    const status = this.container.querySelector('#ik-status');
    if (status) {
      status.textContent = `${result.converged ? 'CONVERGED' : 'BEST FIT'} · ${(result.errorM * 1000).toFixed(1)} mm · ${result.iterations} it`;
      status.className = result.converged ? 'ik-success' : 'ik-warning';
    }
    this.updateKinematics();
  }

  public updateKinematics(): void {
    const res = DHKinematicsSolver.computeForwardKinematics(this.dhChain);

    // Update End Effector Text
    const posEl = this.container.querySelector('#val-ee-pos');
    const rotEl = this.container.querySelector('#val-ee-rot');
    if (posEl) posEl.textContent = EngineeringMeasurements.vector(res.endEffector.position, 'm');
    if (rotEl) rotEl.textContent = EngineeringMeasurements.vector(res.endEffector.orientationEulerDeg, 'deg');
    EngineeringProjectSession.setArtifact('robotics', `${this.dhChain.length} DOF · ${EngineeringMeasurements.vector(res.endEffector.position, 'm')}`, { chain: this.dhChain, endEffector: res.endEffector });

    // Rebuild 3D visual arm
    while (this.armGroup.children.length > 0) {
      const child = this.armGroup.children[0] as THREE.Mesh;
      this.armGroup.remove(child);
      child.geometry?.dispose();
    }

    const matLink = new THREE.MeshStandardMaterial({ color: 0x2878a5, metalness: 0.35, roughness: 0.42 });
    const matJoint = new THREE.MeshStandardMaterial({ color: 0x34404d, metalness: 0.45, roughness: 0.34 });

    for (let i = 0; i < res.jointTransforms.length - 1; i++) {
      const T1 = res.jointTransforms[i];
      const T2 = res.jointTransforms[i + 1];

      const p1 = new THREE.Vector3().setFromMatrixPosition(T1);
      const p2 = new THREE.Vector3().setFromMatrixPosition(T2);

      // Joint sphere
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 24), matJoint);
      sphere.position.copy(p1);
      this.armGroup.add(sphere);

      // Link cylinder
      const dist = p1.distanceTo(p2);
      if (dist > 0.01) {
        const cylGeom = new THREE.CylinderGeometry(0.025, 0.025, dist, 24);
        cylGeom.translate(0, dist / 2, 0);
        cylGeom.rotateX(Math.PI / 2);
        const cyl = new THREE.Mesh(cylGeom, matLink);
        cyl.position.copy(p1);
        cyl.lookAt(p2);
        this.armGroup.add(cyl);
      }
    }
  }

  public resize(): void {
    const canvasContainer = this.container.querySelector('#robotics-canvas-container') as HTMLElement;
    if (!canvasContainer) return;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private frameRobot(): void {
    const bounds = new THREE.Box3().setFromObject(this.armGroup);
    bounds.expandByPoint(this.targetMarker.position);
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const distance = Math.max(0.8, sphere.radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.15);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(direction.lengthSq() ? direction : new THREE.Vector3(1, 0.7, 1).normalize(), distance);
    this.camera.near = Math.max(0.01, distance / 100);
    this.camera.far = Math.max(50, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private setCameraView(view: 'iso' | 'front' | 'top'): void {
    const center = new THREE.Box3().setFromObject(this.armGroup).getCenter(new THREE.Vector3());
    const distance = Math.max(1.4, this.camera.position.distanceTo(this.controls.target));
    const direction = view === 'front' ? new THREE.Vector3(0, 0, 1) : view === 'top' ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(1, 0.75, 1).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.update();
  }

  public render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
