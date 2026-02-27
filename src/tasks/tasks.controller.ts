import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
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
import { type UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
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

  @Put('update/:id')
  update(
    @Body() updateData: UpdateTaskDto,
    @Param('id') taskId: string,
    @Req() req: Request & { user: User },
  ) {
    return this.tasksService.update(taskId, updateData, req.user);
  }

  @Get('stats/priority-summary')
  getPrioritySummary(@Req() req: Request & { user: User }) {
    return this.tasksService.getPrioritySummary(req.user);
  }

  @Get('history/:taskId')
  getTaskHistory(
    @Param('taskId') taskId: string,
    @Req() req: Request & { user: User },
    @Query('limit') limit?: string,
    @Query('select') select?: string,
  ) {
    const limitNum = limit ? Math.min(100, parseInt(limit)) : 50;
    return this.tasksService.getTaskHistory(taskId, req.user, limitNum, select);
  }

  @Get(':id')
  getTaskById(
    @Param('id') taskId: string,
    @Req() req: Request & { user: User },
  ) {
    return this.tasksService.getTaskById(taskId, req.user);
  }

  @Get()
  getTasks(
    @Query() queryDto: TaskQueryDto,
    @Req() req: Request & { user: User },
  ) {
    return this.tasksService.getTasks(queryDto, req.user);
  }
}
