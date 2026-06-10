import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { registerSchema, loginSchema } from '../validations/task.validation.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
const JWT_EXPIRES_IN = '1d';

export const authController = new Hono();

// REGISTER
authController.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Validation failed', details: result.error.flatten() }, 400);
    }

    const { email, password, name, role, department } = result.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400);
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        department: role === 'PM' ? 'PRODUCT' : (role === 'CLIENT' ? null : department),
      },
    });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, department: user.department },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return c.json({
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    }, 201);
  } catch (err: any) {
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});

// LOGIN
authController.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Validation failed', details: result.error.flatten() }, 400);
    }

    const { email, password } = result.data;

    // Find User
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify Password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, department: user.department },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return c.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});

// GET CURRENT USER DETAILS (via Token)
authController.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  return c.json({ user });
});
