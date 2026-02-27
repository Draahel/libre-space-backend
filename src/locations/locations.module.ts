import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { PrismaModule } from 'src/common/prisma/prisma.module';

@Module({
  providers: [LocationsService],
  controllers: [LocationsController],
  imports: [PrismaModule],
})
export class LocationsModule {}
