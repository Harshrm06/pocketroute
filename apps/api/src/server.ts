/**
 * PocketRoute Fastify API Server Entry Point.
 */
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    app.log.info(`PocketRoute API listening on ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only run automatically if executed directly as main script
if (
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js'))
) {
  main();
}
