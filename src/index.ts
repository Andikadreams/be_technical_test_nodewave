import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authController } from './controllers/auth.controller.js';
import { taskController } from './controllers/task.controller.js';

const app = new Hono();

// Logger Middleware
app.use('*', logger());

// CORS Middleware
app.use(
  '*',
  cors({
    origin: '*', // In production, replace with specific frontend URL
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Health Check
app.get('/', (c) => c.text('NodeWave Project Management Backend is running!'));

// Route Mounts
app.route('/api/auth', authController);
app.route('/api/tasks', taskController);

// Server Start for Bun
const port = parseInt(process.env.PORT || '3001', 10);
console.log(`Server is running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
