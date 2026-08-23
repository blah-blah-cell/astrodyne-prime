import * as THREE from 'three';
import { DHParameter, DHKinematicsSolver } from './kinematics-solver.js';
import { URDFGenerator } from './urdf-generator.js';

export class RoboticsStudioView {
  private container: HTMLElement;
  private dhChain: DHParameter[];

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private armGroup: THREE.Group;

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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050811);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 50);
    this.camera.position.set(1.5, 1.2, 1.8);
    this.camera.lookAt(0, 0.4, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.armGroup = new THREE.Group();
    this.scene.add(this.armGroup);

    this.initLightsAndGrid();
    this.renderUI();
  }

  private initLightsAndGrid(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const grid = new THREE.GridHelper(4, 20, 0x1e293b, 0x0f172a);
    this.scene.add(grid);
  }

  private renderUI(): void {
    let jointSlidersHtml = '';
    this.dhChain.forEach((j, i) => {
      jointSlidersHtml += `
        <div class="dh-joint-slider-group">
          <div class="dh-label-row">
            <span class="dh-joint-name">Joint ${i + 1}: ${j.name}</span>
            <span class="dh-joint-val" id="val-joint-${i}">${j.thetaDeg}°</span>
          </div>
          <input type="range" id="slider-joint-${i}" min="${j.minLimitDeg || -180}" max="${j.maxLimitDeg || 180}" value="${j.thetaDeg}" class="form-range">
        </div>
      `;
    });

    this.container.innerHTML = `
      <div class="robotics-studio-layout">
        <!-- Left DH & Joint Control Panel -->
        <div class="robotics-control-panel">
          <div class="robotics-header">
            <div class="robotics-title">🤖 URDF & DH Forward Kinematics Studio</div>
            <div class="robotics-badge">6-DOF Manipulator Chain</div>
          </div>

          <div class="dh-joint-list">
            ${jointSlidersHtml}
          </div>

          <!-- End Effector Telemetry -->
          <div class="robotics-telem-box">
            <div class="aero-card-title">End-Effector Pose (XYZ / RPY)</div>
            <div class="cad-telem-row"><span>Position [X, Y, Z]:</span> <b id="val-ee-pos">[0.00, 0.00, 0.00] m</b></div>
            <div class="cad-telem-row"><span>Orientation [R, P, Y]:</span> <b id="val-ee-rot">[0.0°, 0.0°, 0.0°]</b></div>
          </div>

          <button id="btn-export-urdf" class="btn-cad-export">📥 Export ROS URDF XML</button>
        </div>

        <!-- Right 3D Viewport -->
        <div class="robotics-viewport-wrapper" id="robotics-canvas-container"></div>
      </div>
    `;

    const canvasContainer = this.container.querySelector('#robotics-canvas-container') as HTMLElement;
    if (canvasContainer) {
      canvasContainer.appendChild(this.renderer.domElement);
      this.resize();
    }

    this.attachEvents();
    this.updateKinematics();
  }

  private attachEvents(): void {
    this.dhChain.forEach((_, i) => {
      const slider = this.container.querySelector(`#slider-joint-${i}`) as HTMLInputElement;
      const valLabel = this.container.querySelector(`#val-joint-${i}`);
      slider?.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        this.dhChain[i].thetaDeg = v;
        if (valLabel) valLabel.textContent = `${v}°`;
        this.updateKinematics();
      });
    });

    const btnUrdf = this.container.querySelector('#btn-export-urdf');
    btnUrdf?.addEventListener('click', () => {
      const links = this.dhChain.map((j, i) => ({ name: `arm_link_${i + 1}`, massKg: 0.6, size: [0.05, 0.05, j.aM || 0.2] as [number, number, number] }));
      const xml = URDFGenerator.generateURDF('Astrodyne_6DOF_Manipulator', links, this.dhChain);
      const blob = new Blob([xml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'astrodyne_6dof_robot.urdf';
      a.click();
      URL.revokeObjectURL(url);
    });

    window.addEventListener('resize', () => this.resize());
  }

  public updateKinematics(): void {
    const res = DHKinematicsSolver.computeForwardKinematics(this.dhChain);

    // Update End Effector Text
    const posEl = this.container.querySelector('#val-ee-pos');
    const rotEl = this.container.querySelector('#val-ee-rot');
    if (posEl) posEl.textContent = `[${res.endEffector.position.join(', ')}] m`;
    if (rotEl) rotEl.textContent = `[${res.endEffector.orientationEulerDeg.join('°, ')}°]`;

    // Rebuild 3D visual arm
    while (this.armGroup.children.length > 0) {
      this.armGroup.remove(this.armGroup.children[0]);
    }

    const matLink = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.5, roughness: 0.3 });
    const matJoint = new THREE.MeshStandardMaterial({ color: 0xa855f7, metalness: 0.7, roughness: 0.2 });

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

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
