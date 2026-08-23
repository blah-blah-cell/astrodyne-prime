import * as THREE from 'three';
import { PartGraph } from './part-graph.js';
import { SocketRegistry, WorldSocket } from './socket-registry.js';
import { PartDefinition, PartInstance } from './types.js';
import { MultibodySolver } from './multibody-solver.js';

export class BuilderViewport {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public partGraph: PartGraph;
  public multibodySolver: MultibodySolver;

  // Viewport Interaction State
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private isMouseDown = false;
  private prevMousePos = { x: 0, y: 0 };

  // Camera Orbit State
  private spherical = new THREE.Spherical(5.0, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3(0, 0.5, 0);

  public activePartDef: PartDefinition | null = null;
  private ghostMesh: THREE.Object3D | null = null;
  private socketMarkersGroup = new THREE.Group();
  private currentSnapTarget: { sourceSocket: any; targetSocket: WorldSocket; transform: any } | null = null;

  public isVisible = false;
  public isKinematicsTestMode = false;

  constructor(container: HTMLElement, partGraph: PartGraph) {
    this.container = container;
    this.partGraph = partGraph;
    this.multibodySolver = new MultibodySolver();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f1d);
    this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.04);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 1000);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 15);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Grid floor
    const gridHelper = new THREE.GridHelper(30, 60, 0x38bdf8, 0x1e293b);
    this.scene.add(gridHelper);

    this.scene.add(this.socketMarkersGroup);

    // Initial Starter Block
    const baseDef = this.partGraph.getDefinition('block_modular_cube_025m');
    if (baseDef) {
      const baseMesh = baseDef.createMesh();
      baseMesh.position.set(0, 0, 0);
      this.scene.add(baseMesh);

      this.partGraph.addPart({
        instanceId: 'part_root_base_01',
        definitionId: baseDef.id,
        position: [0, 0, 0],
        rotationQuaternion: [0, 0, 0, 1],
        attachedSockets: new Map(),
        mesh: baseMesh
      });
      this.updateSocketMarkers();
    }

    this.initEvents();
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private updateCamera(): void {
    this.camera.position.setFromSpherical(this.spherical).add(this.target);
    this.camera.lookAt(this.target);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.container.style.display = visible ? 'block' : 'none';
    if (visible) {
      this.onResize();
      this.render();
    }
  }

  public async startKinematicsTest(): Promise<void> {
    if (!this.multibodySolver.isInitialized) {
      await this.multibodySolver.init();
    }

    this.multibodySolver.buildSimulationWorld(
      this.partGraph.assembly,
      (id) => this.partGraph.getDefinition(id)
    );
    this.multibodySolver.start();
    this.isKinematicsTestMode = true;
    this.socketMarkersGroup.visible = false;
    if (this.ghostMesh) this.ghostMesh.visible = false;
  }

  public stopKinematicsTest(): void {
    this.multibodySolver.pause();
    this.multibodySolver.clear();
    this.isKinematicsTestMode = false;
    this.socketMarkersGroup.visible = true;

    // Reset part meshes to analytical graph positions
    for (const [_, inst] of this.partGraph.assembly.parts.entries()) {
      if (inst.mesh) {
        inst.mesh.position.set(...inst.position);
        inst.mesh.quaternion.set(...inst.rotationQuaternion);
      }
    }
  }

  public setActivePartDef(def: PartDefinition | null): void {
    this.activePartDef = def;

    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh = null;
    }

    if (def) {
      this.ghostMesh = def.createMesh();
      this.ghostMesh.traverse((child: any) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.65
          });
        }
      });
      this.scene.add(this.ghostMesh);
    }
  }

  public updateSocketMarkers(): void {
    while (this.socketMarkersGroup.children.length > 0) {
      this.socketMarkersGroup.remove(this.socketMarkersGroup.children[0]);
    }

    for (const [_, instance] of this.partGraph.assembly.parts.entries()) {
      const def = this.partGraph.getDefinition(instance.definitionId);
      if (!def) continue;

      const worldSockets = SocketRegistry.getWorldSockets(instance, def);
      for (const ws of worldSockets) {
        if (ws.socket.isOccupied) continue;

        const ringGeo = new THREE.RingGeometry(0.015, 0.025, 16);
        const ringMat = new THREE.MeshBasicMaterial({
          color: ws.socket.type === 'FLANGE_COUPLER' ? 0xe11d48 : ws.socket.type === 'CYLINDRICAL_AXIAL' ? 0xf59e0b : 0x00f2fe,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85
        });
        const marker = new THREE.Mesh(ringGeo, ringMat);
        marker.position.copy(ws.worldPosition);
        marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ws.worldNormal);
        this.socketMarkersGroup.add(marker);
      }
    }
  }

  private initEvents(): void {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      if (e.button === 2 || e.altKey) {
        this.isMouseDown = true;
        this.prevMousePos = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0 && this.activePartDef && this.ghostMesh && !this.isKinematicsTestMode) {
        this.placeActivePart();
      }
    });

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isMouseDown) {
        const deltaX = e.clientX - this.prevMousePos.x;
        const deltaY = e.clientY - this.prevMousePos.y;
        this.spherical.theta -= deltaX * 0.005;
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.spherical.phi - deltaY * 0.005));
        this.updateCamera();
        this.prevMousePos = { x: e.clientX, y: e.clientY };
      }

      if (this.activePartDef && this.ghostMesh && !this.isKinematicsTestMode) {
        this.updateGhostPlacement();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });

    el.addEventListener('wheel', (e) => {
      this.spherical.radius = Math.max(0.5, Math.min(30.0, this.spherical.radius + e.deltaY * 0.005));
      this.updateCamera();
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updateGhostPlacement(): void {
    if (!this.activePartDef || !this.ghostMesh) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const allExistingSockets: WorldSocket[] = [];
    for (const [_, instance] of this.partGraph.assembly.parts.entries()) {
      const def = this.partGraph.getDefinition(instance.definitionId);
      if (!def) continue;
      allExistingSockets.push(...SocketRegistry.getWorldSockets(instance, def));
    }

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundHit = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(groundPlane, groundHit);

    if (allExistingSockets.length > 0 && this.activePartDef.sockets.length > 0) {
      const tempGhostInstance: PartInstance = {
        instanceId: 'temp_ghost',
        definitionId: this.activePartDef.id,
        position: [groundHit.x, groundHit.y, groundHit.z],
        rotationQuaternion: [0, 0, 0, 1],
        attachedSockets: new Map()
      };

      const sourceWorldSockets = SocketRegistry.getWorldSockets(tempGhostInstance, this.activePartDef);
      const match = SocketRegistry.findBestSnapTarget(sourceWorldSockets, allExistingSockets, 0.45);

      if (match) {
        const snap = SocketRegistry.computeSnapTransform(match.source.socket, match.target);
        this.ghostMesh.position.set(...snap.position);
        this.ghostMesh.quaternion.set(...snap.rotationQuaternion);
        this.currentSnapTarget = {
          sourceSocket: match.source.socket,
          targetSocket: match.target,
          transform: snap
        };
        return;
      }
    }

    this.currentSnapTarget = null;
    this.ghostMesh.position.set(groundHit.x, 0, groundHit.z);
    this.ghostMesh.rotation.set(0, 0, 0);
  }

  public placeActivePart(): boolean {
    if (!this.activePartDef) return false;

    const instanceId = `part_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const mesh = this.activePartDef.createMesh();

    let pos: [number, number, number];
    let quat: [number, number, number, number];

    if (this.currentSnapTarget) {
      pos = this.currentSnapTarget.transform.position;
      quat = this.currentSnapTarget.transform.rotationQuaternion;
    } else if (this.ghostMesh) {
      pos = [this.ghostMesh.position.x, this.ghostMesh.position.y, this.ghostMesh.position.z];
      quat = [this.ghostMesh.quaternion.x, this.ghostMesh.quaternion.y, this.ghostMesh.quaternion.z, this.ghostMesh.quaternion.w];
    } else {
      pos = [0, 0, 0];
      quat = [0, 0, 0, 1];
    }

    mesh.position.set(...pos);
    mesh.quaternion.set(...quat);
    this.scene.add(mesh);

    const instance: PartInstance = {
      instanceId,
      definitionId: this.activePartDef.id,
      position: pos,
      rotationQuaternion: quat,
      attachedSockets: new Map(),
      mesh
    };

    this.partGraph.addPart(instance);

    if (this.currentSnapTarget) {
      this.partGraph.connectSockets(
        instanceId,
        this.currentSnapTarget.sourceSocket.id,
        this.currentSnapTarget.targetSocket.partInstanceId,
        this.currentSnapTarget.targetSocket.socket.id
      );
    }

    this.updateSocketMarkers();
    return true;
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  public render(): void {
    if (this.isVisible) {
      if (this.isKinematicsTestMode) {
        this.multibodySolver.step(1 / 60);
      }
      this.renderer.render(this.scene, this.camera);
    }
  }
}
