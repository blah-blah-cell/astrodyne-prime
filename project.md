# Astrodyne Prime

## Motto

One workspace. Traceable models. Real solvers.

## Product definition

Astrodyne Prime is a browser engineering workstation that connects five workflows:

1. Parametric solid modeling and exchange-file import.
2. Mechanical assembly and rigid-body testing.
3. Rocket stability, atmospheric ascent, and flight-dynamics comparison.
4. Robot kinematics and simulation export.
5. Orbital and spacecraft flight simulation.

The value is not a large feature count. The value is that geometry, mass, reference area, propulsion, telemetry, and configuration can move between workspaces without being re-entered.

## Engineering policy

- Use a maintained open-source kernel when a credible one exists.
- Keep adapters, unit conversion, workflow state, and visualization in Astrodyne.
- Do not label a native approximation as an integration with another project.
- Show the active backend, version, unit system, and readiness in the interface.
- Preserve editable source data when moving between workspaces.
- Treat disagreement between solvers as a result to investigate, not a number to hide.
- Do not mark parity with commercial or research tools without reference cases and documented tolerances.

## Current backend architecture

| Domain | Backend | Integration depth |
| --- | --- | --- |
| Solid CSG | Manifold 3.5 WASM | Editable feature history, Boolean solids, mass properties, STL |
| Source CAD | OpenSCAD 2026.06.08 WASM | Full OpenSCAD parser/evaluator in a worker, STL generation, measured mass properties, repeated renders |
| CAD exchange | OpenCascade 7.9.3 WASM | STEP/IGES/BREP read, assembly transforms, colors, topology counts, triangulation |
| Visualization | Three.js 0.185 | Shared CAD, assembly, robotics, and flight rendering |
| Assembly dynamics | Rapier 0.20 WASM | Collision bodies, kinematic placement, rigid-body test mode |
| Flight dynamics comparison | JSBSim 1.2.4 WASM | Generated vertical-launch model, live execution, apogee/time comparison |
| Rocket simulation comparison | OpenRocket Core 24.12 JVM | Real component hierarchy, generated thrust curve and mass depletion, official simulation, trajectory and warnings |
| N-body computation | WebGPU/WGSL | Browser-native compute and telemetry reduction |

The following are Astrodyne-native models and are identified as such in the UI:

- Barrowman static-stability calculation.
- Coupled RK4 vertical rocket ascent.
- D2Q9 lattice-Boltzmann flow visualization.
- Denavit-Hartenberg forward kinematics and numerical IK.
- Power-bus and motor operating-point calculations.
- Spacecraft propulsion, TVC, atmospheric controls, and orbital telemetry.

## Cross-workspace contracts

- CAD to Assembly: millimetres convert to metres; selected material, density, exact calculated mass, source identity, bounds, and convex collision geometry are preserved.
- CAD to Aerodynamics: projected area, reference area, fineness ratio, and drag estimate become analysis inputs.
- Aerodynamics to Flight: mass, propellant, thrust, burn time, reference area, and SI units are preserved.
- Assembly to export: part graph, transforms, joints, and mass data produce Gazebo, MoveIt, and Isaac Sim artifacts.
- Assembly mates: a captured fixed reference and selected moving part are constrained through compatible sockets with exact SI offset, axial twist, center distance, positional residual, and angular residual.
- All workspaces contribute revisioned artifacts to one persisted engineering project.

## Interface standard

- White, low-decoration workstation layout.
- No emoji controls or decorative status language.
- Exact numeric fields beside direct manipulation.
- Units visible at the point of entry and output.
- Shared selectable display precision.
- Validation errors block invalid simulation or transfer.
- Backend readiness is visible, including loading and failure states.

## Current limitations

- CAD does not yet include a constraint sketcher, fillets/chamfers, drawings, or STEP export.
- Assembly does not yet include a general mate solver, interference analysis, or contact-set editor. Catalog assemblies persist, but transferred custom CAD definitions still need a serialized geometry package to survive a full reload.
- The flow view is a 2D design aid, not validated three-dimensional CFD.
- JSBSim integration is a vertical-launch validation path, not yet the primary atmospheric 6-DOF runtime.
- OpenRocket integration currently generates one single-stage vehicle from active fields; `.ork` round-trip, recovery devices, staging, wind, and motor-database selection remain to be added.
- Mission analysis lacks ephemeris kernels, reference-frame tooling, event finding, and comparison with GMAT/Orekit.
- Results are not certified for safety-critical use.

See `roadmap.md` for the measured implementation sequence and completion criteria.
