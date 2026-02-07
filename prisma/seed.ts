import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Crear Departamentos (Áreas Funcionales)
  await prisma.department.upsert({
    where: { name: 'Refrigeración' },
    update: {},
    create: {
      name: 'Refrigeración',
      description:
        'Mantenimiento de aires acondicionados y sistemas de enfriamiento.',
      tags: ['aire acondicionado', 'fuga de gas', 'limpieza de filtros'],
    },
  });

  await prisma.department.upsert({
    where: { name: 'Sistemas' },
    update: {},
    create: {
      name: 'Sistemas',
      description: 'Soporte técnico, redes y hardware.',
      tags: ['internet', 'computador', 'proyector', 'software'],
    },
  });

  // 2. Crear Ubicaciones Jerárquicas (Ejemplo Piso 1 y 2)
  await prisma.location.create({
    data: {
      name: 'Piso 1',
      type: 'FLOOR',
      children: {
        create: [
          { name: 'Cafetería Central', type: 'AREA' },
          { name: 'Zona de Parqueaderos S1', type: 'PARKING' },
        ],
      },
    },
  });

  await prisma.location.create({
    data: {
      name: 'Piso 3',
      type: 'FLOOR',
      children: {
        create: [
          { name: 'Laboratorio 301', type: 'ROOM' },
          { name: 'Sala de Informática A', type: 'ROOM' },
        ],
      },
    },
  });

  console.log('Seed finalizado con éxito 🌱');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
