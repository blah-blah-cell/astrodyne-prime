# GRAVITAS: WebGPU Barnes-Hut N-Body Physics Simulator

[![WebGPU](https://img.shields.io/badge/WebGPU-WGSL-blue.svg)](https://www.w3.org/TR/webgpu/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2+-646CFF.svg)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Production-grade, highly-parallel N-Body gravitational physics simulator modeling 500,000+ interacting celestial bodies in real-time inside your browser using WebGPU and WGSL compute shaders.**

---

## 🌌 Overview

**GRAVITAS** is a high-performance astrophysical simulator combining GPU-accelerated spatial hierarchical tree building, Barnes-Hut multipole expansion algorithms, symplectic integrators, and an HDR particle rendering pipeline.

Simulate cosmological galaxy mergers, relativistic black hole tidal disruptions, 3-body chaotic periodic choreographies, and planetary ring dynamics at 60 FPS directly on the GPU.

---

## ⚡ Key Technical Features

### 1. WebGPU / WGSL Compute Shaders
- **GPU Morton Codes & Radix Tree BVH**:
  - Encodes 3D coordinates onto a 30-bit Morton Z-order curve ($1024^3$ grid resolution).
  - Parallel Bitonic Sort across workgroups.
  - Linear BVH Radix Tree topology generation on GPU (Karras 2012 algorithm) in $O(N)$ time.
  - Bottom-up parallel multipole center-of-mass & total mass aggregation.
- **Barnes-Hut Traversal Kernel ($O(N \log N)$)**:
  - Traversal with configurable Multipole Acceptance Criterion (MAC) opening angle $\theta \in [0.2, 1.4]$:
    $$\frac{s}{d} < \theta$$
  - Plummmer softening factor $\epsilon$ to prevent numerical singularities:
    $$\mathbf{a}_i = \sum_j \frac{G M_j (\mathbf{r}_j - \mathbf{r}_i)}{\left(\|\mathbf{r}_j - \mathbf{r}_i\|^2 + \epsilon^2\right)^{3/2}}$$
- **Direct $O(N^2)$ Shared-Memory Tiled Force Kernel**:
  - Workgroup-tiled shared memory (`var<workgroup> tile_pos`) for exact reference benchmarking ($N \le 65,536$).
- **Symplectic Numerical Integrators**:
  - **Velocity Verlet** (2nd-Order Kick-Drift-Kick) preserving phase space and Hamiltonian energy.
  - **Yoshida 4th-Order Symplectic Integrator** with exact analytical drift-kick sub-stages:
    $$w_0 = -\frac{2^{1/3}}{2 - 2^{1/3}}, \quad w_1 = \frac{1}{2 - 2^{1/3}}$$
  - **Post-Newtonian Relativistic Precession**:
    $$\mathbf{a}_{\text{PN}} = -\frac{3 G M \|\mathbf{r} \times \mathbf{v}\|^2}{c^2 r^5} \mathbf{r}$$
  - **Inelastic Celestial Merge**: Mass & momentum conservation during close stellar encounters.

### 2. High-Dynamic-Range (HDR) Visual Pipeline
- **Instanced Particle Billboarding**: Camera-facing particle sprites with Gaussian-Airy disk profiles.
- **Velocity-to-Temperature Planck Blackbody Radiation**:
  - Continuous mapping from cool infrared (1000K) to solar white (5800K) to relativistic blue-violet (30000K+).
- **HDR Dual-Filter Bloom & Post-Processing**:
  - Separable Gaussian blur passes.
  - ACES Filmic Tone Mapping curve.
  - Subtle chromatic aberration and cinematic vignette.
- **Galactic Reference Grid & Coordinate System**: Infinite anti-aliased reference plane on $y = 0$.

### 3. Rich Celestial Scenarios & Presets
1. **Galaxy Collision (Milky Way vs Andromeda)**: Two spiral galaxies with supermassive black holes, exponential discs, and dark matter spherical halos on a parabolic merger trajectory.
2. **Black Hole Accretion & Tidal Disruption (TDE)**: Relativistic accretion disk around a central black hole disrupting an incoming star at the Roche limit.
3. **Lagrange Points & Trojan Asteroids (L4/L5)**: Sun-Jupiter 3-body system with Trojan and Greek asteroid swarms in stable libration.
4. **3-Body Figure-8 Choreography**: The celebrated Chenciner-Montgomery equal-mass planar figure-8 periodic orbit surrounded by a dust disk.
5. **Globular Cluster Core Collapse**: Virialized Plummer sphere showing gravitational relaxation and core collapse.
6. **Planetary Rings & Shepherd Moons**: Ring system sculpted by Lindblad resonances and shepherd moons maintaining the Cassini division.

### 4. Interactive Physics Telemetry Dashboard
- Live Body Count selector (10k, 50k, 100k, 250k, 500k, 1M bodies).
- Live FPS, Compute dispatch time (ms), and GFLOPS estimation.
- Real-time Hamiltonian Energy Conservation ratio $\Delta E / E_0$ with live sparkline history.
- Angular Momentum Conservation drift $\Delta L / L_0$.
- Interactive Mouse Tools: Arcball Orbit Cam, Gravity Well / Attractor, Repulsor / Blast, Black Hole Spawner.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Modern WebGPU-compatible browser (Google Chrome 113+, Microsoft Edge 113+, Brave, or Firefox Nightly with `dom.webgpu.enabled = true`).

### Installation & Development

```bash
# Clone the repository
git clone https://github.com/blah-blah-cell/gravitas-nbody-sim.git
cd gravitas-nbody-sim

# Install dependencies
npm install

# Start local development server
npm run dev
```

### Production Build

```bash
# Compile TypeScript and bundle with Vite
npm run build

# Preview the production build locally
npm run preview
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume Physics Simulation |
| `R` | Restart Current Scenario |
| `G` | Toggle Galactic Reference Grid |
| `1` | Select Camera Orbit Tool |
| `2` | Select Gravity Well Tool |
| `3` | Select Repulsor Tool |
| `Left Click + Drag` | Orbit Camera / Apply Tool |
| `Right Click + Drag` | Pan Camera |
| `Scroll Wheel` | Dolly Zoom In / Out |

---

## 📐 Mathematical Formulation

### Barnes-Hut Multipole Acceptance Criterion (MAC)
For a particle at position $\mathbf{r}_i$ and a tree node at center of mass $\mathbf{R}_{\text{com}}$ with bounding box size $s$:
$$\text{Distance } d = \|\mathbf{r}_i - \mathbf{R}_{\text{com}}\|$$
$$\text{If } \frac{s}{d} < \theta \implies \mathbf{F} = \frac{G M_j (\mathbf{R}_{\text{com}} - \mathbf{r}_i)}{\left(\|\mathbf{R}_{\text{com}} - \mathbf{r}_i\|^2 + \epsilon^2\right)^{3/2}}$$

### Symplectic Velocity Verlet
$$\mathbf{v}\left(t + \frac{\Delta t}{2}\right) = \mathbf{v}(t) + \mathbf{a}(t) \frac{\Delta t}{2}$$
$$\mathbf{r}(t + \Delta t) = \mathbf{r}(t) + \mathbf{v}\left(t + \frac{\Delta t}{2}\right) \Delta t$$
$$\mathbf{v}(t + \Delta t) = \mathbf{v}\left(t + \frac{\Delta t}{2}\right) + \mathbf{a}(t + \Delta t) \frac{\Delta t}{2}$$

---

## 📄 License

MIT License © 2026 GRAVITAS Engineering Team.
