import * as THREE from 'three';
import { TransformControls, TransformControlsMode } from 'three/addons/controls/TransformControls.js';
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
  private draggingPart: PartInstance | null = null;
  private dragPlane = new THREE.Plane();
  private dragOffset = new THREE.Vector3();
  private dragMoved = false;

  // Camera Orbit State
  private spherical = new THREE.Spherical(3.5, Math.PI / 3, Math.PI / 4);
  private target = new THREE.Vector3(0, 0.5, 0);

  public activePartDef: PartDefinition | null = null;
  private ghostMesh: THREE.Object3D | null = null;
  private socketMarkersGroup = new THREE.Group();
  private currentSnapTarget: { sourceSocket: any; targetSocket: WorldSocket; transform: any } | null = null;

  public isVisible = false;
  public isKinematicsTestMode = false;
  public selectedPartId: string | null = null;
  private selectionHelper: THREE.BoxHelper | null = null;
  private transformControls: TransformControls;
  private transformHelper: THREE.Object3D;
  private gizmoDetachedConnections = 0;
  private onSelectionChanged?: (instance: PartInstance | null, definition: PartDefinition | null) => void;
  private onAssemblyChanged?: () => void;
  private onPlacementChanged?: (definition: PartDefinition | null, message: string) => void;
  public gridSnapEnabled = true;
  public socketSnapEnabled = true;
  public gridSize = 0.05;

  constructor(container: HTMLElement, partGraph: PartGraph) {
    this.container = container;
    this.partGraph = partGraph;
    this.multibodySolver = new MultibodySolver();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f4f6);
    this.scene.fog = new THREE.FogExp2(0xf2f4f6, 0.025);

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.05, 1000);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.mode = 'translate';
    this.transformControls.space = 'world';
    this.transformControls.size = 0.8;
    this.transformHelper = this.transformControls.getHelper();
    this.scene.add(this.transformHelper);
    this.transformControls.addEventListener('mouseDown', () => {
      if (!this.selectedPartId) return;
      this.gizmoDetachedConnections = this.partGraph.disconnectPart(this.selectedPartId);
      if (this.gizmoDetachedConnections) this.updateSocketMarkers();
    });
    this.transformControls.addEventListener('objectChange', () => this.syncSelectedFromGizmo());
    this.transformControls.addEventListener('mouseUp', () => {
      this.syncSelectedFromGizmo();
      this.partGraph.recomputeMassAndCenter();
      this.updateSocketMarkers();
      this.onAssemblyChanged?.();
      if (this.gizmoDetachedConnections) this.onPlacementChanged?.(null, `Gizmo transform detached ${this.gizmoDetachedConnections} connection${this.gizmoDetachedConnections === 1 ? '' : 's'}.`);
      this.gizmoDetachedConnections = 0;
    });

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 15);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // Grid floor
    const gridHelper = new THREE.GridHelper(30, 60, 0x7f8b98, 0xd4dae1);
    this.scene.add(gridHelper);

    this.scene.add(this.socketMarkersGroup);

    // Initial Starter Block
    const baseDef = this.partGraph.getDefinition('block_modular_cube_025m');
    if (baseDef) {
      const baseMesh = baseDef.createMesh();
      const baseY = baseDef.dimensions[1] / 2;
      baseMesh.position.set(0, baseY, 0);
      this.scene.add(baseMesh);

      this.partGraph.addPart({
        instanceId: 'part_root_base_01',
        definitionId: baseDef.id,
        position: [0, baseY, 0],
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
    this.transformControls.enabled = false;
    this.transformHelper.visible = false;
    this.socketMarkersGroup.visible = false;
    if (this.ghostMesh) this.ghostMesh.visible = false;
  }

  public stopKinematicsTest(): void {
    this.multibodySolver.pause();
    this.multibodySolver.clear();
    this.isKinematicsTestMode = false;
    this.transformControls.enabled = true;
    this.transformHelper.visible = true;
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
    if (def) this.selectPart(null);

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
    this.onPlacementChanged?.(def, def ? `Click the grid to place ${def.name}. Press Esc to cancel.` : 'Select a catalog part or use Add for automatic placement.');
  }

  public setSelectionHandler(handler: (instance: PartInstance | null, definition: PartDefinition | null) => void): void {
    this.onSelectionChanged = handler;
  }

  public setAssemblyChangeHandler(handler: () => void): void { this.onAssemblyChanged = handler; }
  public setPlacementChangeHandler(handler: (definition: PartDefinition | null, message: string) => void): void { this.onPlacementChanged = handler; }

  public selectPart(instanceId: string | null): void {
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.geometry.dispose();
      (this.selectionHelper.material as THREE.Material).dispose();
      this.selectionHelper = null;
    }
    this.selectedPartId = instanceId;
    const instance = instanceId ? this.partGraph.assembly.parts.get(instanceId) ?? null : null;
    const definition = instance ? this.partGraph.getDefinition(instance.definitionId) ?? null : null;
    if (instance?.mesh) {
      this.selectionHelper = new THREE.BoxHelper(instance.mesh, 0x56d6a0);
      this.scene.add(this.selectionHelper);
      this.transformControls.attach(instance.mesh);
      this.configureTransformSnapping();
    } else {
      this.transformControls.detach();
    }
    this.onSelectionChanged?.(instance, definition);
  }

  public setTransformMode(mode: Extract<TransformControlsMode, 'translate' | 'rotate'>): void {
    this.transformControls.setMode(mode);
    this.configureTransformSnapping();
  }

  public toggleTransformSpace(): 'world' | 'local' {
    const next = this.transformControls.space === 'world' ? 'local' : 'world';
    this.transformControls.setSpace(next);
    return next;
  }

  public configureTransformSnapping(): void {
    this.transformControls.translationSnap = this.gridSnapEnabled ? this.gridSize : null;
    this.transformControls.rotationSnap = this.gridSnapEnabled ? THREE.MathUtils.degToRad(15) : null;
  }

  private syncSelectedFromGizmo(): void {
    const instance = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    if (!instance?.mesh) return;
    instance.position = [instance.mesh.position.x, instance.mesh.position.y, instance.mesh.position.z];
    instance.rotationQuaternion = [instance.mesh.quaternion.x, instance.mesh.quaternion.y, instance.mesh.quaternion.z, instance.mesh.quaternion.w];
    this.selectionHelper?.update();
    this.onSelectionChanged?.(instance, this.partGraph.getDefinition(instance.definitionId) ?? null);
  }

  public updateSelectedTransform(position: [number, number, number], rotationDegrees?: [number, number, number]): boolean {
    const instance = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    if (!instance?.mesh || position.some(value => !Number.isFinite(value))) return false;
    const detached = this.partGraph.disconnectPart(instance.instanceId);
    instance.position = [...position];
    instance.mesh.position.set(...position);
    if (rotationDegrees && rotationDegrees.every(Number.isFinite)) {
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rotationDegrees[0]), THREE.MathUtils.degToRad(rotationDegrees[1]), THREE.MathUtils.degToRad(rotationDegrees[2]), 'XYZ'));
      instance.rotationQuaternion = [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
      instance.mesh.quaternion.copy(quaternion);
    }
    this.partGraph.recomputeMassAndCenter();
    this.updateSocketMarkers();
    this.selectionHelper?.update();
    this.onSelectionChanged?.(instance, this.partGraph.getDefinition(instance.definitionId) ?? null);
    this.onAssemblyChanged?.();
    if (detached) this.onPlacementChanged?.(null, `Transform applied; ${detached} connection${detached === 1 ? '' : 's'} detached.`);
    return true;
  }

  public duplicateSelectedPart(): boolean {
    const source = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    if (!source) return false;
    const definition = this.partGraph.getDefinition(source.definitionId);
    if (!definition) return false;
    const offset = Math.max(this.gridSize, definition.dimensions[0]);
    const position: [number, number, number] = [source.position[0] + offset, source.position[1], source.position[2]];
    const mesh = definition.createMesh(); mesh.position.set(...position); mesh.quaternion.set(...source.rotationQuaternion); this.scene.add(mesh);
    const instanceId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.partGraph.addPart({ instanceId, definitionId: source.definitionId, position, rotationQuaternion: [...source.rotationQuaternion], attachedSockets: new Map(), mesh });
    this.updateSocketMarkers(); this.selectPart(instanceId); this.onAssemblyChanged?.(); return true;
  }

  public rotateSelectedBy(axis: 'x' | 'y' | 'z', degrees: number): boolean {
    const instance = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    if (!instance?.mesh) return false;
    const detached = this.partGraph.disconnectPart(instance.instanceId);
    const delta = new THREE.Quaternion().setFromAxisAngle(axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(degrees));
    instance.mesh.quaternion.multiply(delta).normalize();
    instance.rotationQuaternion = [instance.mesh.quaternion.x, instance.mesh.quaternion.y, instance.mesh.quaternion.z, instance.mesh.quaternion.w];
    this.updateSocketMarkers(); this.selectionHelper?.update(); this.onSelectionChanged?.(instance, this.partGraph.getDefinition(instance.definitionId) ?? null); this.onAssemblyChanged?.();
    if (detached) this.onPlacementChanged?.(null, `Rotation applied; ${detached} connection${detached === 1 ? '' : 's'} detached.`);
    return true;
  }

  public detachSelectedPart(): boolean {
    if (!this.selectedPartId) return false;
    const detached = this.partGraph.disconnectPart(this.selectedPartId);
    this.updateSocketMarkers();
    if (detached) this.onAssemblyChanged?.();
    this.onPlacementChanged?.(null, detached ? `${detached} connection${detached === 1 ? '' : 's'} detached.` : 'Selected part has no connections.');
    return detached > 0;
  }

  public mateSelectedTo(
    referencePartId: string,
    sourceSocketId: string,
    targetSocketId: string,
    offsetM: number = 0,
    twistDegrees: number = 0
  ): { displacementM: number; socketErrorM: number; angularErrorDeg: number } {
    const moving = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    const reference = this.partGraph.assembly.parts.get(referencePartId);
    if (!moving?.mesh || !reference || moving.instanceId === referencePartId) throw new Error('Select a moving part different from the mate reference.');
    const movingDefinition = this.partGraph.getDefinition(moving.definitionId);
    const referenceDefinition = this.partGraph.getDefinition(reference.definitionId);
    const sourceSocket = movingDefinition?.sockets.find(socket => socket.id === sourceSocketId);
    const targetWorldSocket = referenceDefinition
      ? SocketRegistry.getWorldSockets(reference, referenceDefinition).find(socket => socket.socket.id === targetSocketId)
      : undefined;
    if (!movingDefinition || !sourceSocket || !targetWorldSocket) throw new Error('The selected mate socket is unavailable.');
    if (!SocketRegistry.isCompatible(sourceSocket, targetWorldSocket.socket)) throw new Error('The selected sockets have incompatible type or gender.');
    if (targetWorldSocket.socket.isOccupied) throw new Error('The reference socket is already occupied.');
    if (!Number.isFinite(offsetM) || !Number.isFinite(twistDegrees)) throw new Error('Mate offset and twist must be finite numbers.');

    const before = moving.mesh.position.clone();
    this.partGraph.disconnectPart(moving.instanceId);
    const transform = SocketRegistry.computeMateTransform(sourceSocket, targetWorldSocket, offsetM, twistDegrees);
    moving.position = [...transform.position];
    moving.rotationQuaternion = [...transform.rotationQuaternion];
    moving.mesh.position.set(...transform.position);
    moving.mesh.quaternion.set(...transform.rotationQuaternion);
    this.partGraph.connectSockets(moving.instanceId, sourceSocket.id, reference.instanceId, targetWorldSocket.socket.id);

    this.partGraph.recomputeMassAndCenter();
    this.updateSocketMarkers();
    this.selectionHelper?.update();
    this.onSelectionChanged?.(moving, movingDefinition);
    this.onAssemblyChanged?.();

    const resolved = SocketRegistry.getWorldSockets(moving, movingDefinition).find(socket => socket.socket.id === sourceSocket.id)!;
    const expectedPosition = targetWorldSocket.worldPosition.clone().addScaledVector(targetWorldSocket.worldNormal, offsetM);
    const angularDot = THREE.MathUtils.clamp(resolved.worldNormal.dot(targetWorldSocket.worldNormal.clone().negate()), -1, 1);
    return {
      displacementM: before.distanceTo(moving.mesh.position),
      socketErrorM: resolved.worldPosition.distanceTo(expectedPosition),
      angularErrorDeg: THREE.MathUtils.radToDeg(Math.acos(angularDot))
    };
  }

  public addPartAtNextFreePosition(definition: PartDefinition): boolean {
    const bounds = new THREE.Box3();
    for (const instance of this.partGraph.assembly.parts.values()) if (instance.mesh) bounds.expandByObject(instance.mesh);
    const x = bounds.isEmpty() ? 0 : bounds.max.x + definition.dimensions[0] / 2 + this.gridSize;
    const position: [number, number, number] = [this.gridSnapEnabled ? Math.ceil(x / this.gridSize) * this.gridSize : x, definition.dimensions[1] / 2, 0];
    const mesh = definition.createMesh();
    mesh.position.set(...position);
    this.scene.add(mesh);
    const instanceId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.partGraph.addPart({ instanceId, definitionId: definition.id, position, rotationQuaternion: [0, 0, 0, 1], attachedSockets: new Map(), mesh });
    this.updateSocketMarkers();
    this.selectPart(instanceId);
    this.onAssemblyChanged?.();
    this.onPlacementChanged?.(null, `${definition.name} added and selected. Drag it on the grid or edit its exact transform.`);
    return true;
  }

  public deleteSelectedPart(): boolean {
    if (!this.selectedPartId) return false;
    const id = this.selectedPartId;
    this.selectPart(null);
    this.partGraph.removePart(id);
    this.updateSocketMarkers();
    this.onAssemblyChanged?.();
    return true;
  }

  public focusSelectedPart(): void {
    const instance = this.selectedPartId ? this.partGraph.assembly.parts.get(this.selectedPartId) : null;
    if (!instance?.mesh) return;
    const bounds = new THREE.Box3().setFromObject(instance.mesh);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    this.target.copy(sphere.center);
    this.spherical.radius = Math.max(0.6, sphere.radius * 5);
    this.updateCamera();
  }

  public frameAssembly(): void {
    const bounds = new THREE.Box3();
    for (const instance of this.partGraph.assembly.parts.values()) if (instance.mesh) bounds.expandByObject(instance.mesh);
    if (bounds.isEmpty()) {
      this.target.set(0, 0.25, 0);
      this.spherical.radius = 3.5;
    } else {
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      this.target.copy(sphere.center);
      this.spherical.radius = Math.max(0.8, sphere.radius * 3.5);
    }
    this.updateCamera();
  }

  public setCameraView(view: 'iso' | 'front' | 'top'): void {
    if (view === 'iso') {
      this.spherical.theta = Math.PI / 4;
      this.spherical.phi = Math.PI / 3;
    } else if (view === 'front') {
      this.spherical.theta = 0;
      this.spherical.phi = Math.PI / 2 - 0.05;
    } else {
      this.spherical.theta = 0;
      this.spherical.phi = 0.05;
    }
    this.updateCamera();
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
      if (this.transformControls.axis || this.transformControls.dragging) return;
      if (e.button === 2 || e.altKey) {
        this.isMouseDown = true;
        this.prevMousePos = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0 && !this.isKinematicsTestMode) {
        if (this.activePartDef && this.ghostMesh) this.placeActivePart();
        else this.beginPartDrag(e);
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

      if (this.draggingPart) this.updatePartDrag(e);

      if (this.activePartDef && this.ghostMesh && !this.isKinematicsTestMode) {
        this.updateGhostPlacement();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      if (this.draggingPart) {
        const moved = this.dragMoved;
        this.draggingPart = null;
        this.dragMoved = false;
        if (moved) {
          this.partGraph.recomputeMassAndCenter();
          this.updateSocketMarkers();
          this.selectionHelper?.update();
          this.onAssemblyChanged?.();
        }
      }
    });

    el.addEventListener('wheel', (e) => {
      this.spherical.radius = Math.max(0.5, Math.min(30.0, this.spherical.radius + e.deltaY * 0.005));
      this.updateCamera();
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', event => {
      if (!this.isVisible || (event.target as HTMLElement | null)?.matches('input, textarea, select')) return;
      if (event.key === 'Escape') this.setActivePartDef(null);
      else if (event.key === 'Delete') this.deleteSelectedPart();
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); this.duplicateSelectedPart(); }
      else if (event.key.toLowerCase() === 'r') this.rotateSelectedBy('y', 90);
    });
  }

  private partFromPointer(event: MouseEvent): PartInstance | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes = [...this.partGraph.assembly.parts.values()].flatMap(instance => instance.mesh ? [instance.mesh] : []);
    const hit = this.raycaster.intersectObjects(meshes, true)[0];
    if (!hit) return null;
    return [...this.partGraph.assembly.parts.values()].find(instance => {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (node === instance.mesh) return true;
        node = node.parent;
      }
      return false;
    }) ?? null;
  }

  private beginPartDrag(event: MouseEvent): void {
    const selected = this.partFromPointer(event);
    this.selectPart(selected?.instanceId ?? null);
    if (!selected?.mesh) return;
    this.draggingPart = selected;
    const detached = this.partGraph.disconnectPart(selected.instanceId);
    if (detached) {
      this.updateSocketMarkers();
      this.onPlacementChanged?.(null, `Dragging detached ${detached} connection${detached === 1 ? '' : 's'}.`);
    }
    this.dragMoved = false;
    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), selected.mesh.position);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, point)) this.dragOffset.copy(selected.mesh.position).sub(point);
  }

  private updatePartDrag(event: MouseEvent): void {
    if (!this.draggingPart?.mesh) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, point)) return;
    point.add(this.dragOffset);
    const snap = (value: number) => this.gridSnapEnabled ? Math.round(value / this.gridSize) * this.gridSize : value;
    point.x = snap(point.x);
    point.z = snap(point.z);
    this.draggingPart.mesh.position.copy(point);
    this.draggingPart.position = [point.x, point.y, point.z];
    this.dragMoved = true;
    this.selectionHelper?.update();
    this.onSelectionChanged?.(this.draggingPart, this.partGraph.getDefinition(this.draggingPart.definitionId) ?? null);
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
    const groundCenterY = this.activePartDef.dimensions[1] / 2;

    if (this.socketSnapEnabled && allExistingSockets.length > 0 && this.activePartDef.sockets.length > 0) {
      const tempGhostInstance: PartInstance = {
        instanceId: 'temp_ghost',
        definitionId: this.activePartDef.id,
        position: [groundHit.x, groundCenterY, groundHit.z],
        rotationQuaternion: [0, 0, 0, 1],
        attachedSockets: new Map()
      };

      const sourceWorldSockets = SocketRegistry.getWorldSockets(tempGhostInstance, this.activePartDef);
      const match = SocketRegistry.findBestSnapTarget(sourceWorldSockets, allExistingSockets, 0.08);

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
    const snap = (value: number) => this.gridSnapEnabled ? Math.round(value / this.gridSize) * this.gridSize : value;
    this.ghostMesh.position.set(snap(groundHit.x), groundCenterY, snap(groundHit.z));
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
    this.selectPart(instanceId);
    this.onAssemblyChanged?.();
    this.onPlacementChanged?.(this.activePartDef, `${this.activePartDef.name} placed. Click again to place another, or press Esc.`);
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
