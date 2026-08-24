# ASTRODYNE PRIME & AXIOM Multi-Physics Engineering Hub
## Product Architecture, Engineering Vision & Technical Whitepaper

---

## 1. Executive Summary

**ASTRODYNE PRIME & AXIOM** is an open-source, web-first, hardware-accelerated **Multi-Disciplinary Physics Simulation & Engineering Hub**. It bridges the historical chasm between disparate engineering domains by consolidating:
1. **Parametric 3D CAD Modeling & 3D Printing** (OpenSCAD / Manifold-3D WASM).
2. **Atmospheric Rocket Flight Dynamics & Stability** (OpenRocket / NASA TR R-58 Barrowman Method).
3. **Robotics & Serial Manipulator Kinematics** (ROS URDF / Denavit-Hartenberg Matrix Solvers).
4. **Modular Machine & Vehicle Drivetrain Physics** (AXIOM / Rapier3D WASM / Trailmakers-style builder).
5. **Relativistic Spaceflight & Computational Astrodynamics** (WebGPU / WGSL Barnes-Hut $O(N \log N)$ compute).
6. **Frontier Autonomous AI Systems Architecture** (**ASTRA AI** with live bi-directional simulation telemetry).

By running directly in the browser via **WebGPU**, **WebGL2**, and **WebAssembly (WASM)**, ASTRODYNE PRIME eliminates the barrier of heavy Linux toolchains, proprietary license fees, and disconnected software pipelines. Engineers, roboticists, rocketeers, students, and makers can design a component in CAD, test its aerodynamic center of pressure, attach it to a 6-DOF robotic manipulator, assemble it into a multi-stage rocket, and launch it into orbit—all within a single unified workspace.

---

## 2. Problem Statement & Market Gap

| Traditional Engineering Workflow | ASTRODYNE PRIME & AXIOM Solution |
|:---|:---|
| **Siloed Software Stacks**: CAD in SolidWorks/FreeCAD $	o$ Aero in OpenRocket $	o$ Robotics in ROS/Gazebo $	o$ Orbital flight in KSP/GMAT. Zero interoperability. | **Unified 5-Studio Hub**: Instant data flow between CAD, rocketry, robotics, vehicle mechanics, and orbital physics in a single viewport. |
| **Heavy Toolchain Overhead**: Setting up ROS 2, Gazebo, or OpenSCAD often requires Linux VMs, complex Docker setups, or gigabytes of dependencies. | **Zero-Install Web-Native Performance**: 100% client-side execution via WebGPU compute shaders and WebAssembly compiled engines. |
| **Static Geometry vs Dynamic Physics**: CAD parts are passive geometries without mass properties, motor torque curves, or aerodynamics. | **Physics-Aware Assemblies**: Every part carries mass tensors, aerodynamic coefficients, motor torque curves $	au(\omega)$, and snap sockets. |
| **Passive AI Assistance**: Generic chatbots give markdown text snippets without knowing the state of the user's simulation or 3D scene. | **Active AI Co-Engineer (ASTRA AI)**: Live context bridge receiving coordinates, stage states, DAG topology, and executing direct multi-studio tool actions. |

---

## 3. Product System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ASTRODYNE PRIME CLIENT (BROWSER)                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                  FLIGHT DIRECTOR GLASSMORPHIC HUD                                │
│        [🌌 SPACEFLIGHT]   [🛠️ AXIOM BUILDER]   [📐 OPENSCAD CAD]   [🎯 OPENROCKET]   [🤖 ROBOTICS]        │
├─────────────────┬─────────────────┬──────────────────┬───────────────────┬───────────────────────┤
│ 🚀 SPACEFLIGHT  │ 🛠️ AXIOM BUILD  │ 📐 OPENSCAD CAD  │ 🎯 OPENROCKET     │ 🤖 URDF ROBOTICS      │
│   STUDIO        │   STUDIO        │   STUDIO         │   STUDIO          │   STUDIO              │
├─────────────────┼─────────────────┼──────────────────┼───────────────────┼───────────────────────┤
│ • WebGPU WGSL   │ • Modular DAG   │ • Manifold WASM  │ • Barrowman NASA  │ • DH Forward Matrix   │
│   Compute       │   Part Graph    │   CSG Engine     │   TR R-58 Solver  │ • 6-DOF Joint Sliders │
│ • Barnes-Hut    │ • Rapier3D WASM │ • Parametric DSL │ • Static Margin   │ • Live End-Effector   │
│   N-Body ($N\log N$)│ • Motor Curves  │ • Mass/Vol Diag  │ • RK4 Trajectory  │   Pose [XYZ / RPY]    │
│ • 6-DoF Cockpit │ • Gear Ratios   │ • STL Slicing    │ • Mach Wave Drag  │ • ROS 2 URDF XML      │
│ • NavBall HUD   │ • WASD Drive    │   Export         │ • Launch to Space │   Export              │
├─────────────────┴─────────────────┴──────────────────┴───────────────────┴───────────────────────┤
│                                 ASTRA AI AUTONOMOUS CO-ENGINEER                                  │
│   • Live Telemetry Bridge  • BYOK Frontier LLMs (Gemini / Claude / GPT)  • Multi-Studio Tool Calls │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Deep Studio Breakdown

### Studio 1: 📐 OpenSCAD / Manifold-3D Parametric CAD Studio
- **Core Technology**: WebAssembly build of `manifold-3d` (guaranteeing 2-manifold non-self-intersecting solid geometry).
- **Capabilities**:
  - Parametric Script Editor supporting Constructive Solid Geometry (CSG) syntax (`cube`, `cylinder`, `sphere`, `union`, `difference`, `intersection`, `translate`, `rotate`, `scale`).
  - Real-time physical diagnostics: Solid Volume ($mm^3$ / $cm^3$), Surface Area ($mm^2$), Triangle & Vertex Counts, and estimated PLA 3D printing mass ($m = V \cdot 1.24	ext{ g/cm}^3$).
  - **`📥 Export STL`**: Direct download of standard Stereolithography files ready for slicing in Bambu Studio, PrusaSlicer, or Ultimaker Cura.
  - **`➕ Import to AXIOM`**: Instantly converts the generated CAD solid into an active mechanical component inside the AXIOM modular part graph.

### Studio 2: 🎯 OpenRocket Aerodynamics & Barrowman Stability Lab
- **Core Technology**: Mathematical implementation of NASA Technical Report R-58 (*Barrowman Method*) and 4th-Order Runge-Kutta numerical integration.
- **Capabilities**:
  - Parametric component sizing for Supersonic Ogive/Conical Nose Cones, Body Tubes, Trapezoidal/Delta Fin Sets, and Solid Rocket Motors.
  - Real-time Center of Pressure ($X_{cp}$) and Center of Gravity ($X_{cg}$) calculations.
  - Barrowman Static Stability Margin ($\sigma = (X_{cp} - X_{cg})/D$) with color-coded safety indicators (Optimal, Marginal, Overstable, Unstable).
  - RK4 Atmospheric Ascent Trajectory Prediction modeling barometric exponential air density $ho(h) = 1.225 e^{-h/8500}$, Mach-dependent wave drag $C_d(M)$, dynamic pressure ($Q_{\max}$), apogee ($m$), and optimal parachute ejection delay.
  - **`🚀 Launch into Spaceflight`**: One-click transfer of rocket geometry and motor mass/thrust curves into the active WebGPU spaceflight simulator.

### Studio 3: 🤖 URDF Robotics & Denavit-Hartenberg Kinematics Studio
- **Core Technology**: Denavit-Hartenberg ($DH$) $4	imes 4$ homogeneous transformation matrix algebra and ROS URDF XML compilation.
- **Capabilities**:
  - Configurable 6-DOF articulated serial robot manipulator ($T_0^n = \prod_{i=1}^n A_i(	heta_i, d_i, a_i, lpha_i)$).
  - Interactive joint angle modulation sliders ($	heta_1 	o 	heta_6$) updating Three.js 3D links and joint meshes at 60 FPS.
  - Real-time Cartesian End-Effector Position $[X, Y, Z]	ext{ m}$ and Euler Orientation $[	ext{Roll}, 	ext{Pitch}, 	ext{Yaw}]$.
  - **`📥 Export ROS URDF XML`**: Generates complete, standards-compliant ROS / ROS 2 `<robot>` description files with `<link>`, `<joint>`, `<inertial>`, `<visual>`, and `<collision>` definitions.

### Studio 4: 🛠️ AXIOM Modular Machine & Vehicle Builder
- **Core Technology**: Directed Acyclic Graph (DAG) part hierarchy, discrete attachment sockets, and `@dimforge/rapier3d-compat` WASM physics.
- **Capabilities**:
  - Intuitive snap-together modular building system (Trailmakers / Besiege style) with 7 socket classes (Cylindrical axial, Flange coupler, Hex bolt, Hinge servo, Ball socket, Linear slider, Snap grid).
  - Comprehensive Parts Catalog: Structural blocks, rocket fuselages, supersonic nosecones, solid rocket boosters, liquid engines, all-terrain rover wheels, DC drive motors, suspension struts, and aerodynamic control fins.
  - Drivetrain physics modeling DC motor linear torque-speed curves ($	au(\omega) = 	au_{	ext{stall}}(1 - \omega/\omega_{	ext{free}})$), spur gear ratio multiplication ($	au_2 = 	au_1 \cdot i \cdot \eta$), and 50/50 open differential torque splitting.
  - Real-time Kinematics & Drivetrain Drive Test Mode: Control assembled ground vehicles directly with `<W>`, `<a>`, `<s>`, `<D>`.

### Studio 5: 🚀 WebGPU Spaceflight & Relativistic Astrodynamics Simulator
- **Core Technology**: WebGPU compute shaders (WGSL), Morton code Octree BVH, Barnes-Hut $O(N \log N)$ force evaluation with relativistic Einstein-Infeld-Hoffmann correction terms ($1 + rac{3GM}{c^2 r}$).
- **Capabilities**:
  - Full 6-DoF spacecraft flight deck with continuous RCS attitude torques (Pitch, Yaw, Roll), main engine throttle control, and explosive staging.
  - 3D NavBall HUD with horizon pitch ladder, compass heading, and automatic SAS autopilot modes (Prograde, Retrograde, Normal, Anti-Normal, Radial-Out, Radial-In, Maneuver Target, Kill-Rot).
  - Tsiolkovsky multi-stage propulsion physics with stage mass accounting and live $\Delta v$ budget tracking.
  - Real-time Keplerian orbital element extraction (Apoapsis, Periapsis, Semi-Major Axis $a$, Eccentricity $e$, Inclination $i$, True Anomaly $
u$) and dynamic orbital trajectory splines.
  - Massive celestial scenarios: 500,000+ particle galaxy collisions, black hole accretion discs with relativistic gravitational redshift, Lagrange points (L4/L5 Trojan asteroids), and Voyager slingshot trajectories.

---

## 5. ASTRA AI: The Autonomous Engineering Co-Pilot

ASTRA AI is not a static text chatbot—it is an autonomous agent integrated directly into the simulation runtime:
- **Bi-Directional Telemetry Bridge**: Continuously feeds the LLM with live spacecraft altitude, velocity, Keplerian orbital parameters, fuel percentages, AXIOM assembled part graph topology, available catalog definitions, active celestial bodies, and current UI mode.
- **Multi-Studio Action Execution**: Parses and dispatches structured actions:
  - `generate_cad_model`: Writes and compiles OpenSCAD scripts.
  - `simulate_rocket_aero`: Runs Barrowman aerodynamic stability checks.
  - `configure_robot_chain`: Configures 6-DOF URDF robotic manipulators.
  - `build_machine`: Synthesizes and connects parts in the AXIOM assembly graph.
  - `launch_custom_vehicle`: Transitions assemblies directly to launchpad ignition.
  - `set_maneuver_node`: Calculates and executes orbital circularization burns.
- **BYOK (Bring-Your-Own-Key) Integration**: Supports direct client-side API keys for Google Gemini (`gemini-2.0-flash`), Anthropic (`claude-3-5-sonnet`), and OpenAI (`gpt-4o`), alongside an offline deterministic mathematical engineering solver.

---

## 6. Technical Stack & Dependencies

- **Frontend & Runtime**: TypeScript 5.7+, Vite 6.2+, Modern HTML5/CSS3 Glassmorphic UI.
- **Rendering & Shaders**: WebGPU (WGSL compute and render pipelines), Three.js (r174).
- **Physics & Geometry Engines**:
  - `manifold-3d` (WASM CSG solid geometry).
  - `@dimforge/rapier3d-compat` (WASM rigid-body physics).
  - Custom Barrowman NASA TR R-58 Aerodynamic Stability Solver.
  - Custom Symplectic Hamiltonian Runge-Kutta 4th-Order Integrator.
  - Custom Denavit-Hartenberg Forward Kinematics Matrix Engine.
- **Quality Assurance**: Automated integration test suites (`tests/test_all_engineering_hubs.ts`, `tests/test_ai_agent.ts`), Microsoft Edge Chrome DevTools Protocol (CDP) live browser automation.
