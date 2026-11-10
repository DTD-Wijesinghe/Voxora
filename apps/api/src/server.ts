import { config } from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerSessionRoutes } from './modules/sessions/routes.js';

// pnpm runs the API from apps/api, so also look for the repository-root .env.
config({ path: ['.env', '../../.env'], quiet: true });

const app = Fastify({ logger: true });

await app.register(cors, { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' });
await app.register(websocket);
await registerSessionRoutes(app);

app.get('/health', async () => ({ status: 'ok', service: 'voxora-api' }));

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

