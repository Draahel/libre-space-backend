import {
  Body,
  Controller,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { User } from '@prisma/client';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('add')
  @UseInterceptors(FilesInterceptor('file'))
  create(
    @Body() createTaskDto: CreateTaskDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Req() req: Request & { user: User },
  ) {
    const reporterId = req.user.id;
    const imageFiles = files?.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
    }));
    return this.tasksService.create(createTaskDto, reporterId, imageFiles);
  }
}
