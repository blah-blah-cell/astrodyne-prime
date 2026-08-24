# Astrodyne Prime Roadmap

## Completion rule

A roadmap item is complete only when the real workflow is implemented, automated checks pass, and the rendered browser workflow has been exercised. A badge, mock control, exporter stub, or copied algorithm name is not completion.

## Current baseline

### Workstation and project model — complete

- Clean white five-workspace interface with no emoji controls.
- Shared measurement precision and visible SI units.
- Revisioned, persisted cross-workspace artifacts.
- Live backend/version/readiness bar.
- Responsive layout and browser-tested navigation.

### CAD — usable baseline

- Editable feature history with box, cylinder, sphere, union, subtraction, intersection, transforms, enable/disable, reorder, duplicate, undo, and redo.
- Manifold 3.5 WASM for watertight CSG and triangulation.
- Volume, surface area, bounds, triangle/vertex count, material density, and calculated mass.
- STL output and transfer into Assembly or Aerodynamics, including the selected material, density, exact calculated mass, and source identity.
- OpenCascade 7.9.3 WASM STEP/IGES/BREP import with assembly transforms, reusable geometry, source colors, topology counts, and tessellation.
- OpenCascade upstream fixture validation: 18 parts, 5 reusable geometries, 1,996 triangles.
- OpenSCAD 2026.06.08 WebAssembly snapshot with the full language runtime, worker execution, STL parsing, measured volume/surface/bounds, and consecutive-render lifecycle handling.
- Browser verification includes a hollow nose cone and a 40-tooth gear using variables, loops, vector indexing, transforms, constants, and nested Boolean operations.

### Assembly — usable baseline

- Catalog parts and transferred CAD parts.
- Viewport selection, direct Three.js translate/rotate gizmos, world/local coordinates, drag placement, exact XYZ/rotation entry, grid snapping, socket snapping, detach, delete, duplicate, frame, camera presets, undo, redo, save, and open.
- Per-instance socket occupancy and connection graph.
- Explicit reference/moving-part socket mates with compatibility filtering, exact axial offset and twist, center-distance measurement, and reported position/angular residuals.
- Mass, center of mass, power-bus, motor, and gearbox analysis.
- Rapier 0.20 WASM collision and kinematic test mode.
- Persisted catalog-part assemblies and data-derived launch readiness; launch is blocked unless a real assembly motor supplies both thrust and propellant.
- Gazebo SDF, MoveIt YAML, and Isaac Sim USDA export.

### Aerodynamics and rocketry — design-stage baseline

- Complete editable nose, body, fin, mass, motor, and propellant inputs with validation.
- Native Barrowman stability calculation and coupled RK4 vertical ascent.
- CAD-derived projected/reference area and drag estimate.
- D2Q9 pressure-flow visualization and deterministic airframe optimization.
- Trajectory chart, SI JSON output, no-liftoff detection, and flight transfer.
- JSBSim 1.2.4 WASM independent validation generated from the active mass, inertia, area, drag, thrust, and burn inputs.
- Browser result for the default case: RK4 apogee 2,361.500 m; JSBSim apogee 2,653.343 m; model difference 12.4%; JSBSim time to apogee 18.580 s.
- OpenRocket Core 24.12 JVM validation generated from the active nose, airframe, fin, mass, motor-mount, thrust, burn, and propellant inputs.
- Browser result for the default case: OpenRocket apogee 2,166.782 m; time to apogee 13.940 s; maximum velocity 543.876 m/s; 10,929 native solver samples; two explicit simulation warnings.

### Flight — usable baseline

- WebGPU N-body runtime, spacecraft telemetry, orbits, atmosphere, launch clamp, staging, fuel mass, and SI delta-v.
- Two-axis thrust-vector control with configurable hard limits, engine ignition/shutdown, mass flow, off-axis force, steering response, exact centering, sliders, and keyboard controls.
- Aerodynamic pitch/yaw/roll controls and SAS modes.
- Browser-tested high-thrust liftoff, restrained low-thrust burn, TVC vectoring, shutdown, fuel-flow stop, and centering.

### Robotics — usable baseline

- Editable Denavit-Hartenberg chain and live forward kinematics.
- Damped least squares, Jacobian transpose, and constrained FABRIK inverse kinematics.
- Joint limits, target/error feedback, synchronized exact joint fields, orbit/pan/zoom, camera presets, fit-to-chain, and URDF export.

## Next phase: CAD and assembly depth

- [ ] Constraint-based 2D sketches with dimensions, relations, profiles, and solver diagnostics.
- [ ] OpenCascade B-Rep construction for extrusion, revolve, loft, sweep, fillet, chamfer, shell, and hole features.
- [ ] STEP/BREP export with names, colors, and assembly hierarchy.
- [ ] General assembly mates: coincident, concentric, distance, angle, planar, revolute, prismatic, and fixed.
- [ ] Interference detection, clearance measurement, contact sets, joint limits, exploded views, and bill of materials.
- [ ] Worker-isolated geometry kernels, progress/cancel support, and large-assembly instancing.

## Next phase: validated aero and flight dynamics

- [ ] Make JSBSim the selectable atmospheric 6-DOF runtime, including body axes, control surfaces, wind, WGS84, propulsion files, fuel tanks, events, and failure reporting.
- [ ] Import JSBSim aircraft/engine/system/script XML sets as project assets.
- [ ] Thrust curves, multi-engine layouts, TVC actuator rate/lag, ignition delay, shutdown transient, staging events, and engine-out cases.
- [ ] OpenRocket `.ork` import/export, recovery components, motor-database curves, multi-stage configurations, wind, launch guides, and warning drill-down.
- [ ] Monte Carlo dispersion with seeded wind, mass, thrust, alignment, sensor, and actuator uncertainties.
- [ ] Gmsh-backed volume/surface meshing adapter with visible mesh quality and convergence controls.
- [ ] SU2 or OpenFOAM service/desktop bridge for validated 3D CFD; retain the D2Q9 view only as a fast qualitative tool.
- [ ] Reference cases with published coefficient/trajectory data and explicit acceptance tolerances.

## Next phase: mission analysis

- [ ] SPICE ephemeris kernels, time systems, celestial reference frames, and state-vector import/export.
- [ ] Patched conics, Lambert targeting, finite burns, event finding, aerobraking, and maneuver optimization.
- [ ] GMAT or Orekit reference-case comparison for every mission-analysis milestone.
- [ ] Covariance propagation, uncertainty reporting, and reproducible scenario files.

## Reliability and delivery

- [ ] Route-level code splitting for the base Three.js application.
- [ ] Worker isolation for OpenCascade, Manifold, JSBSim, optimization, and long-running simulations.
- [ ] Cancellation, timeouts, crash recovery, and deterministic project migrations.
- [ ] Persist transferred custom CAD geometry and definition packages so those assembly parts survive a full reload.
- [ ] Browser automation for local STEP/IGES/BREP upload when the browser control layer supports file attachment.
- [ ] Performance budgets for startup, kernel load, interaction latency, memory, and large models.
- [ ] License notices and source-offer workflow for bundled LGPL WebAssembly components.

## Verification commands

```bash
npm test
npm run openrocket:build
npm run openrocket:test
npm run build
npm audit --omit=dev
git diff --check
```

Current status: all automated suites pass, the production build succeeds, and the runtime dependency audit reports zero vulnerabilities. Vite still reports expected large-chunk advisories for the CAD and flight-dynamics WebAssembly kernels; worker isolation and additional route-level splitting remain planned.
