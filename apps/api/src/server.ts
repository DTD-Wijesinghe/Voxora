import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerSessionRoutes } from './modules/sessions/routes.js';
import { registerAdminRoutes } from './modules/sessions/admin-routes.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true, // reflect the request origin so mobile and desktop both work
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
});
await app.register(websocket);
await registerSessionRoutes(app);
await registerAdminRoutes(app);

app.get('/health', async () => ({ status: 'ok', service: 'voxora-api' }));

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });

