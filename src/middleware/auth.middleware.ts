import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

export interface AuthUser {
  id: string;
  email: string;
  role: 'PM' | 'INTERNAL' | 'CLIENT';
  department?: 'PRODUCT' | 'UIUX' | 'FRONTEND' | 'BACKEND' | null;
}

// Extend Hono's Context Variables
declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized. Missing token.' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser;
    c.set('user', decoded);
    await next();
  } catch (err) {
    return c.json({ error: 'Unauthorized. Invalid or expired token.' }, 401);
  }
}
