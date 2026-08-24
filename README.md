# Astrodyne Prime

Astrodyne Prime is a browser-based engineering workstation for parametric CAD, mechanical assembly, rocket aerodynamics, robotics, and spaceflight simulation. The interface uses a white workspace, exact numeric inputs, visible units, deterministic controls, and explicit solver status.

It is an active engineering project, not a replacement for mature commercial CAD, CFD, or certified flight-analysis software. The roadmap records those gaps openly.

## Current workspaces

- Flight: N-body gravity, orbital telemetry, staged propulsion, launch constraints, atmospheric drag, aerodynamic controls, and two-axis thrust-vector control.
- Assembly: part placement, exact transforms, snapping, explicit two-part socket mates with axial offset and twist, measured solve error, connection management, mass/center-of-mass analysis, power-bus analysis, and Rapier rigid-body kinematics.
- CAD: editable feature history, primitive and Boolean CSG, full OpenSCAD source execution, exact transforms, material mass, STL export, CAD-to-assembly/aero transfer, and STEP/IGES/BREP import.
- Aerodynamics: Barrowman stability, coupled RK4 vertical ascent, CAD-derived reference geometry, D2Q9 flow visualization, airframe optimization, JSBSim validation, and OpenRocket Core validation.
- Robotics: Denavit-Hartenberg chains, forward/inverse kinematics, joint limits, URDF output, and simulation exporters.

## Integrated computational backends

| Backend | Use |
| --- | --- |
| WebGPU / WGSL | N-body computation and rendering |
| Three.js | CAD, assembly, and robotics visualization |
| Manifold 3.5 WASM | Watertight CSG and mesh generation |
| OpenSCAD 2026.06.08 WASM | Full OpenSCAD language execution and STL generation in a worker |
| OpenCascade 7.9.3 WASM | STEP, IGES, and BREP topology import |
| Rapier 0.20 WASM | Rigid bodies, collisions, and assembly kinematics |
| JSBSim 1.2.4 WASM | Independent nonlinear flight-dynamics validation |
| OpenRocket Core 24.12 | Official JVM core, component model, generated motor curve, trajectory, and warnings |

The project also contains focused native solvers for Barrowman stability, RK4 vertical ascent, D2Q9 lattice-Boltzmann visualization, DH/IK robotics, power-bus analysis, and orbital mechanics. These are identified as native in the live toolchain bar; they are not presented as third-party integrations.

## Run locally

```bash
npm install
npm run openrocket:build
npm run dev
```

Open `http://localhost:5173/`. The OpenRocket adapter requires Java 17 or newer. Its build command downloads Maven into the ignored `.cache` directory and resolves `info.openrocket:core:24.12` from Maven Central.

Verification:

```bash
npm test
npm run openrocket:test
npm run build
```

## Important limitations

- CAD has solid CSG and OpenCascade exchange import, but not yet a constraint sketcher, fillets/chamfers, or STEP export.
- Aerodynamics has useful design-stage models and an independent JSBSim comparison, but not a validated 3D RANS/LES CFD pipeline.
- JSBSim validation currently uses a generated vertical-launch external-force model; detailed engine curves, wind, events, dispersion, and launch-contact refinement remain roadmap work.
- OpenRocket Core builds a single-stage rocket and rectangular generated thrust curve from the active inputs. It does not yet import/export `.ork` projects, motor-database curves, recovery systems, staging, or dispersion cases. The JVM route is available through the Vite dev/preview server, not a static-only host.
- Assembly supports placement, snapping, sockets, and rigid-body testing, but still needs a general mate/constraint solver and interference workflow.
- Results are for design exploration and education, not certification or safety-critical decisions.

See [roadmap.md](./roadmap.md) for implemented work, verification records, and the next phases.

## Licensing

Application source is MIT. Bundled dependencies retain their own licenses. OpenSCAD is GPL-2.0-or-later; its exact snapshot URL, checksum, source locations, and license are recorded in `public/vendor/openscad/NOTICE.txt`. OpenRocket Core retains its upstream GPL license and is resolved during the local bridge build. OpenCascade and JSBSim WebAssembly components are distributed under LGPL-2.1 terms; their TypeScript wrappers have their respective upstream licenses.
