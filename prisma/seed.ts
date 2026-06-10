import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Hash passwords
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 2. Clean database (optional, but good for resetting)
  await prisma.auditLog.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.user.deleteMany({});

  // 3. Create Users
  const pmUser = await prisma.user.create({
    data: {
      email: 'pm@nodewave.id',
      password: hashedPassword,
      name: 'Andri (PM)',
      role: 'PM',
      department: 'PRODUCT'
    }
  });

  const uiuxUser = await prisma.user.create({
    data: {
      email: 'uiux@nodewave.id',
      password: hashedPassword,
      name: 'Rudi (UI/UX)',
      role: 'INTERNAL',
      department: 'UIUX'
    }
  });

  const feUser = await prisma.user.create({
    data: {
      email: 'frontend@nodewave.id',
      password: hashedPassword,
      name: 'Fahri (Frontend)',
      role: 'INTERNAL',
      department: 'FRONTEND'
    }
  });

  const beUser = await prisma.user.create({
    data: {
      email: 'backend@nodewave.id',
      password: hashedPassword,
      name: 'Budi (Backend)',
      role: 'INTERNAL',
      department: 'BACKEND'
    }
  });

  const clientUser = await prisma.user.create({
    data: {
      email: 'client@client.id',
      password: hashedPassword,
      name: 'Toyota Client',
      role: 'CLIENT',
      department: null
    }
  });

  console.log('Users seeded successfully:', {
    pm: pmUser.email,
    uiux: uiuxUser.email,
    fe: feUser.email,
    be: beUser.email,
    client: clientUser.email
  });

  // 4. Create some tasks with dependencies for demo purposes
  const taskA = await prisma.task.create({
    data: {
      title: 'UI Design for Dashboard',
      description: 'Create Figma design for the project management dashboard',
      status: 'DONE',
      isClientVisible: true,
      assignedToId: uiuxUser.id,
      version: 1
    }
  });

  const taskB = await prisma.task.create({
    data: {
      title: 'Setup Database Schema',
      description: 'Design and deploy PostgreSQL database schema and seed data',
      status: 'DONE',
      isClientVisible: false,
      assignedToId: beUser.id,
      version: 1
    }
  });

  // Task C depends on Task A and Task B
  const taskC = await prisma.task.create({
    data: {
      title: 'Frontend Integration',
      description: 'Slicing UI design and integrate with backend endpoints',
      status: 'TODO',
      isClientVisible: true,
      assignedToId: feUser.id,
      version: 1,
      dependencies: {
        connect: [{ id: taskA.id }, { id: taskB.id }]
      }
    }
  });

  // Task D is a standalone task
  const taskD = await prisma.task.create({
    data: {
      title: 'Deploy to Staging',
      description: 'Setup deployment on Railway or Render',
      status: 'TODO',
      isClientVisible: true,
      assignedToId: beUser.id,
      version: 1,
      dependencies: {
        connect: [{ id: taskC.id }] // Depends on Frontend integration
      }
    }
  });

  console.log('Tasks seeded successfully:', [taskA.title, taskB.title, taskC.title, taskD.title]);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
