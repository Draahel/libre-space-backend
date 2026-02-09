import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { AiModule } from 'src/ai/ai.module';
import { PrismaModule } from 'src/common/prisma/prisma.module';

@Module({
  providers: [TasksService],
  controllers: [TasksController],
  imports: [AiModule, PrismaModule],
})
export class TasksModule {}
