import { Hono } from 'hono';
import { TaskService } from '../services/task.service.js';
import { createTaskSchema, updateTaskSchema } from '../validations/task.validation.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const taskController = new Hono();
const taskService = new TaskService();

// Apply Auth Middleware to all routes in this controller
taskController.use('*', authMiddleware);

// Helper to parse query parameters for ezfilter
function parseQueryParams(queries: Record<string, string>) {
  const filters: Record<string, any> = {};
  const searchFilters: Record<string, any> = {};
  let page: number | undefined;
  let rows: number | undefined;
  let order: any;

  for (const [key, value] of Object.entries(queries)) {
    if (key.startsWith('filters[')) {
      const fieldName = key.slice(8, -1);
      filters[fieldName] = value;
    } else if (key.startsWith('searchFilters[')) {
      const fieldName = key.slice(14, -1);
      searchFilters[fieldName] = value;
    } else if (key === 'page') {
      page = parseInt(value, 10);
    } else if (key === 'rows') {
      rows = parseInt(value, 10);
    } else if (key.startsWith('order[')) {
      const fieldName = key.slice(6, -1);
      order = { [fieldName]: value };
    }
  }

  return {
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    searchFilters: Object.keys(searchFilters).length > 0 ? searchFilters : undefined,
    page,
    rows,
    order,
  };
}

// GET STANDUP SUMMARY
taskController.get('/standup', async (c) => {
  const user = c.get('user');
  if (user.role === 'CLIENT') {
    return c.json({ error: 'Access denied.' }, 403);
  }
  const summary = await taskService.getStandupSummary();
  return c.json(summary);
});

// GET ALL TASKS
taskController.get('/', async (c) => {
  const user = c.get('user');
  const queries = c.req.queries();
  
  // Transform hono query object to simple records
  const flatQueries: Record<string, string> = {};
  for (const [key, value] of Object.entries(queries)) {
    flatQueries[key] = value[0];
  }

  const filterParams = parseQueryParams(flatQueries);
  const tasks = await taskService.getTasks(user, filterParams);
  return c.json({ tasks });
});

// GET TASK BY ID
taskController.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const task = await taskService.getTaskById(id, user);
  return c.json({ task });
});

// CREATE TASK
taskController.post('/', async (c) => {
  const user = c.get('user');
  try {
    const body = await c.req.json();
    const result = createTaskSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Validation failed', details: result.error.flatten() }, 400);
    }

    const newTask = await taskService.createTask(result.data, user);
    return c.json({ message: 'Task created successfully', task: newTask }, 201);
  } catch (err: any) {
    if (err.status) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});

// UPDATE TASK
taskController.put('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  try {
    const body = await c.req.json();
    const result = updateTaskSchema.safeParse(body);

    if (!result.success) {
      return c.json({ error: 'Validation failed', details: result.error.flatten() }, 400);
    }

    const { version, ...updateFields } = result.data;
    const updatedTask = await taskService.updateTask(id, version, updateFields, user);

    return c.json({ message: 'Task updated successfully', task: updatedTask });
  } catch (err: any) {
    if (err.status) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});

// DELETE TASK
taskController.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  try {
    const deletedTask = await taskService.deleteTask(id, user);
    return c.json({ message: 'Task deleted successfully (soft-deleted)', task: deletedTask });
  } catch (err: any) {
    if (err.status) {
      return c.json({ error: err.message }, err.status);
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});
