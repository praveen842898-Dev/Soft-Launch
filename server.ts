import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerApiRoutes } from './api/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (args[i].startsWith('--port=')) {
      const parsed = Number(args[i].slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 3000;
}

const PORT = resolvePort();

async function startServer() {
  const app = express();

  app.get('/favicon.ico', (_req, res) => {
    const svgPath = path.resolve(__dirname, 'public', 'favicon.svg');
    if (fs.existsSync(svgPath)) {
      res.type('image/svg+xml');
      return res.sendFile(svgPath);
    }
    return res.status(204).end();
  });

  // Mount all /api/* routes (shared with Vercel /api/index.ts)
  registerApiRoutes(app);

  const distPath = path.resolve(__dirname, 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const runningViaTsx = process.execArgv.some((arg) => arg.includes('tsx'));
  const useViteDev =
    process.env.NODE_ENV !== 'production' && (runningViaTsx || !hasBuiltDist);

  if (useViteDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Soft Launch server running on http://0.0.0.0:${PORT} (${useViteDev ? 'dev' : 'production'})`
    );
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
