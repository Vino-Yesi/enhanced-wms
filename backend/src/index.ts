import 'dotenv/config';
import { createApp } from './app';

const PORT = parseInt(process.env.PORT || '4000');

const app = createApp();
const server = app.listen(PORT, () => {
  console.log(`[wms-backend] listening on http://localhost:${PORT}/api (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
});

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[wms-backend] ${sig} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}

export { server };
