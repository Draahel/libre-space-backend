import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  onModuleInit(): void {
    this.$connect();
  }

  onModuleDestroy(): void {
    this.$disconnect();
  }
}
