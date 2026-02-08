import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { TasksModule } from './tasks/tasks.module';
import { AiModule } from './ai/ai.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    LocationsModule,
    TasksModule,
    AiModule,
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
