/// <reference lib="webworker" />

type OpenSCADModule = {
  FS: {
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  };
  callMain(args: string[]): number;
};

type OpenSCADFactory = (options: Record<string, unknown>) => Promise<OpenSCADModule>;

async function getInstance(): Promise<OpenSCADModule> {
  // Keep the vendored Emscripten module outside Vite's source transform graph.
  // OpenSCAD's CLI runtime exits after callMain, so each render gets a fresh
  // module instance. The browser still caches and reuses the compiled WASM.
  const nativeImport = new Function('url', 'return import(url)') as (url: string) => Promise<{ default: OpenSCADFactory }>;
  const module = await nativeImport('/vendor/openscad/openscad.js');
  return module.default({
    noInitialRun: true,
    locateFile: (path: string) => path.endsWith('.wasm') ? '/vendor/openscad/openscad.wasm' : `/vendor/openscad/${path}`
  });
}

self.onmessage = async (event: MessageEvent<{ id: number; script: string }>) => {
  const { id, script } = event.data;
  const inputPath = `/astrodyne-${id}.scad`;
  const outputPath = `/astrodyne-${id}.stl`;
  let instance: OpenSCADModule | null = null;
  try {
    instance = await getInstance();
    instance.FS.writeFile(inputPath, script);
    const exitCode = instance.callMain([inputPath, '--enable=manifold', '--backend=manifold', '-o', outputPath]);
    if (exitCode !== 0) throw new Error(`OpenSCAD exited with status ${exitCode}`);
    const stl = instance.FS.readFile(outputPath).slice();
    instance.FS.unlink(inputPath);
    instance.FS.unlink(outputPath);
    self.postMessage({ id, ok: true, stl }, [stl.buffer]);
  } catch (error) {
    try {
      instance?.FS.unlink(inputPath);
      instance?.FS.unlink(outputPath);
    } catch { /* files may not exist after a parser failure */ }
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
