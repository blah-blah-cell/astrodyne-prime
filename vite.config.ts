import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';

const OPENROCKET_MARKER = 'ASTRODYNE_RESULT:';

function sendJson(response: Connect.ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

function openRocketBridge(): Plugin {
  const bridgeJar = resolve(process.cwd(), 'tools/openrocket-bridge/target/astrodyne-openrocket-bridge.jar');

  const install = (middlewares: Connect.Server) => {
    middlewares.use('/api/openrocket/health', (request, response) => {
      if (request.method !== 'GET') return sendJson(response, 405, { ok: false, error: 'Method not allowed' });
      sendJson(response, 200, { ok: true, available: existsSync(bridgeJar), backend: 'OpenRocket Core', version: '24.12' });
    });

    middlewares.use('/api/openrocket/simulate', (request, response) => {
      if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: 'Method not allowed' });
      if (!existsSync(bridgeJar)) {
        return sendJson(response, 503, { ok: false, error: 'OpenRocket bridge is not built. Run npm run openrocket:build.' });
      }

      let body = '';
      request.setEncoding('utf8');
      request.on('data', chunk => {
        body += chunk;
        if (body.length > 1_000_000) request.destroy(new Error('Request exceeds 1 MB'));
      });
      request.on('error', error => sendJson(response, 400, { ok: false, error: error.message }));
      request.on('end', () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return sendJson(response, 400, { ok: false, error: 'Request body must be valid JSON' });
        }

        const java = spawn('java', ['-Xms64m', '-Xmx768m', '-jar', bridgeJar], { windowsHide: true });
        let stdout = '';
        let stderr = '';
        let finished = false;
        const timeout = setTimeout(() => {
          java.kill();
          if (!finished) sendJson(response, 504, { ok: false, error: 'OpenRocket simulation exceeded 60 seconds' });
          finished = true;
        }, 60_000);

        java.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-4_000_000); });
        java.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-200_000); });
        java.on('error', error => {
          clearTimeout(timeout);
          if (!finished) sendJson(response, 500, { ok: false, error: `Unable to start Java: ${error.message}` });
          finished = true;
        });
        java.on('close', code => {
          clearTimeout(timeout);
          if (finished) return;
          finished = true;
          const line = stdout.split(/\r?\n/).find(entry => entry.startsWith(OPENROCKET_MARKER));
          if (!line) return sendJson(response, 500, { ok: false, error: `OpenRocket bridge exited without a result (code ${code}).`, diagnostics: stderr.slice(-2000) });
          try {
            const result = JSON.parse(line.slice(OPENROCKET_MARKER.length));
            sendJson(response, result.ok ? 200 : 422, result);
          } catch {
            sendJson(response, 500, { ok: false, error: 'OpenRocket bridge returned invalid JSON' });
          }
        });
        java.stdin.end(JSON.stringify(parsed));
      });
    });
  };

  return {
    name: 'astrodyne-openrocket-core',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); }
  };
}

export default defineConfig({
  root: '.',
  plugins: [openRocketBridge()],
  optimizeDeps: {
    exclude: ['@0x62/jsbsim-wasm']
  },
  server: {
    port: 5173,
    open: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true
  }
});
