import { HTTPException } from 'hono/http-exception';
import { prisma } from '../db.js';
import { AuthUser } from '../middleware/auth.middleware.js';
import { BuildQueryFilter } from '@nodewave/prisma-ezfilter';

// Helper to mask task data for client guests
export function maskTaskForClient(task: any): any {
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    isClientVisible: task.isClientVisible,
    version: task.version,
    dependencies: task.dependencies ? task.dependencies.map((dep: any) => maskTaskForClient(dep)) : [],
    dependents: task.dependents ? task.dependents.map((dep: any) => maskTaskForClient(dep)) : [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    // Masked fields
    assignedToId: null,
    assignedTo: null,
    auditLogs: [],
  };
}

export class TaskService {
  private queryBuilder = new BuildQueryFilter();

  async getTasks(user: AuthUser, filterParams: any) {
    // 1. Build dynamic query via ezfilter
    const filterResult = this.queryBuilder.build(filterParams);
    const query = filterResult.query || {};

    // 2. Enforce soft delete and access visibility
    query.where = {
      ...query.where,
      isDeleted: false,
    };

    if (user.role === 'CLIENT') {
      query.where.isClientVisible = true;
    }

    // Include relations for frontend usage
    query.include = {
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        },
      },
      dependencies: {
        where: { isDeleted: false },
      },
      auditLogs: user.role !== 'CLIENT' ? {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
        },
      } : false,
    };

    const tasks = await prisma.task.findMany(query);

    // 3. Apply client-side masking
    if (user.role === 'CLIENT') {
      return tasks.map(maskTaskForClient);
    }

    return tasks;
  }

  async getTaskById(id: string, user: AuthUser) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
          },
        },
        dependencies: {
          where: { isDeleted: false },
        },
        auditLogs: user.role !== 'CLIENT' ? {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, role: true },
            },
          },
        } : false,
      },
    });

    if (!task || task.isDeleted) {
      throw new HTTPException(404, { message: 'Task not found' });
    }

    if (user.role === 'CLIENT' && !task.isClientVisible) {
      throw new HTTPException(403, { message: 'Access denied' });
    }

    if (user.role === 'CLIENT') {
      return maskTaskForClient(task);
    }

    return task;
  }

  async createTask(data: any, user: AuthUser) {
    if (user.role === 'CLIENT') {
      throw new HTTPException(403, { message: 'Clients cannot create tasks' });
    }

    const { dependencyIds, ...taskData } = data;

    return await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          ...taskData,
          version: 1,
          isDeleted: false,
          dependencies: dependencyIds && dependencyIds.length > 0 ? {
            connect: dependencyIds.map((depId: string) => ({ id: depId })),
          } : undefined,
        },
      });

      // Write audit log for task creation
      await tx.auditLog.create({
        data: {
          taskId: task.id,
          userId: user.id,
          changedColumn: 'ALL_FIELDS',
          oldValue: null,
          newValue: `Task created: ${task.title}`,
        },
      });

      return task;
    });
  }

  async updateTask(id: string, clientVersion: number, data: any, user: AuthUser) {
    if (user.role === 'CLIENT') {
      throw new HTTPException(403, { message: 'Clients cannot update tasks' });
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch existing task with dependencies
      const existing = await tx.task.findUnique({
        where: { id },
        include: {
          dependencies: { where: { isDeleted: false } },
        },
      });

      if (!existing || existing.isDeleted) {
        throw new HTTPException(404, { message: 'Task not found' });
      }

      // 2. Concurrency Control: check version
      if (existing.version !== clientVersion) {
        throw new HTTPException(409, {
          message: 'Data concurrency conflict. This task has been modified elsewhere.',
        });
      }

      // 3. Business Guard: PM cannot transition status to DONE
      if (user.role === 'PM' && data.status === 'DONE' && existing.status !== 'DONE') {
        throw new HTTPException(400, {
          message: 'Product Managers are not authorized to mark tasks as DONE. Only the assigned executor can complete it.',
        });
      }

      // 4. Business Guard: Internal team members cannot change title/description
      if (user.role === 'INTERNAL') {
        if (existing.assignedToId !== user.id) {
          throw new HTTPException(403, {
            message: 'Anda hanya diperbolehkan mengubah tugas yang ditugaskan kepada Anda sendiri.',
          });
        }
        if ((data.title && data.title !== existing.title) || (data.description && data.description !== existing.description)) {
          throw new HTTPException(403, {
            message: 'Internal team members are not authorized to update task title or description.',
          });
        }
      }

      // 5. Business Guard: Executor complete constraint
      if (data.status === 'DONE' && existing.status !== 'DONE') {
        if (existing.assignedToId !== user.id && user.role !== 'PM') {
          throw new HTTPException(400, {
            message: 'Only the assigned executor can mark the task as complete.',
          });
        }
      }

      // 6. Business Guard: State-Based Edit Guard for dependency resolution
      if (data.status === 'IN_PROGRESS' && existing.status !== 'IN_PROGRESS') {
        // Fetch all dependencies to verify status
        const dependencies = existing.dependencies;
        const pendingDependencies = dependencies.filter(dep => dep.status !== 'DONE');
        if (pendingDependencies.length > 0) {
          const names = pendingDependencies.map(d => `"${d.title}"`).join(', ');
          throw new HTTPException(400, {
            message: `Cannot transition task to IN_PROGRESS. Prerequisite tasks not complete: ${names}`,
          });
        }
      }

      const { dependencyIds, ...updateFields } = data;

      // 7. Track changed columns for Audit Log
      const auditLogData: any[] = [];
      const keysToCompare = ['title', 'description', 'status', 'isClientVisible', 'assignedToId'];

      for (const key of keysToCompare) {
        if (updateFields[key] !== undefined && updateFields[key] !== (existing as any)[key]) {
          auditLogData.push({
            taskId: id,
            userId: user.id,
            changedColumn: key,
            oldValue: (existing as any)[key]?.toString() || null,
            newValue: updateFields[key]?.toString() || null,
          });
        }
      }

      // Update task record and increment version
      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          ...updateFields,
          version: { increment: 1 },
          dependencies: dependencyIds ? {
            set: dependencyIds.map((depId: string) => ({ id: depId })),
          } : undefined,
        },
      });

      // Write audit logs
      if (auditLogData.length > 0) {
        await tx.auditLog.createMany({
          data: auditLogData,
        });
      }

      return updatedTask;
    });
  }

  async deleteTask(id: string, user: AuthUser) {
    if (user.role !== 'PM') {
      throw new HTTPException(403, { message: 'Only Product Managers can delete tasks.' });
    }

    return await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({
        where: { id },
      });

      if (!existing || existing.isDeleted) {
        throw new HTTPException(404, { message: 'Task not found.' });
      }

      // Perform Soft Delete
      const deletedTask = await tx.task.update({
        where: { id },
        data: {
          isDeleted: true,
          version: { increment: 1 },
        },
      });

      // Write Audit Log
      await tx.auditLog.create({
        data: {
          taskId: id,
          userId: user.id,
          changedColumn: 'isDeleted',
          oldValue: 'false',
          newValue: 'true',
        },
      });

      return deletedTask;
    });
  }

  async getStandupSummary() {
    // Yesterday standup summary (bonus requirement)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const logs = await prisma.auditLog.findMany({
      where: {
        createdAt: {
          gte: yesterday,
        },
      },
      include: {
        task: true,
        user: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Structure summary by department
    const completedTasks: Record<string, string[]> = {};
    const blockedTasks: Record<string, string[]> = {};

    for (const log of logs) {
      const dept = log.user.department || 'GENERAL';
      if (log.changedColumn === 'status' && log.newValue === 'DONE') {
        if (!completedTasks[dept]) completedTasks[dept] = [];
        completedTasks[dept].push(log.task.title);
      }
      if (log.changedColumn === 'status' && log.newValue === 'IN_PROGRESS' && log.oldValue === 'TODO') {
        // Just general updates
      }
    }

    return {
      completedYesterday: completedTasks,
      blockedToday: blockedTasks,
    };
  }
}
