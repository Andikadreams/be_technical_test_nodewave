import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional().default('TODO'),
  isClientVisible: z.boolean().optional().default(false),
  assignedToId: z.string().uuid().nullable().optional(),
  dependencyIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  isClientVisible: z.boolean().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  dependencyIds: z.array(z.string().uuid()).optional(),
  version: z.number({
    required_error: 'Task version is required for concurrency check',
  }).int().positive(),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['PM', 'INTERNAL', 'CLIENT']),
  department: z.enum(['PRODUCT', 'UIUX', 'FRONTEND', 'BACKEND']).nullable().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string(),
});
