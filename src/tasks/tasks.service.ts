import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Record, State, Task, User } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AiService } from 'src/ai/ai.service';
import { AIAnalysisResult } from 'src/ai/interfaces/analysis-result.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    createTaskDto: CreateTaskDto,
    reporterId: string,
    imageFiles: { buffer: Buffer; mimeType: string }[] = [],
  ): Promise<Task> {
    const { description, locationId } = createTaskDto;
    const imageToAnalize =
      imageFiles && imageFiles.length
        ? { buffer: imageFiles[0].buffer, mimeType: imageFiles[0].mimeType }
        : undefined;

    const departments = await this.prisma.department.findMany();
    const departmentNames = departments
      .map((dep) => dep.name)
      .filter((dep) => dep !== 'Unclassified');

    let analysis: AIAnalysisResult;

    try {
      analysis = await this.aiService.analizyIncident(
        description,
        departmentNames,
        imageToAnalize,
      );
    } catch {
      analysis = {
        title: `Incidencia en ${locationId}`,
        suggestedDepartment: 'Unclassified',
        priority: 'MEDIUM',
        estimatedWeight: 2,
        tags: [],
      };
    }

    const departmentId = departments.find(
      (dep) => dep.name === analysis.suggestedDepartment,
    )!.id;

    const technician = await this.prisma.technicalProfile.findFirst({
      where: {
        department_id: departmentId,
        is_available: true,
      },
      orderBy: {
        current_load: 'asc',
      },
    });

    const taskData: Prisma.TaskCreateInput = {
      title: analysis.title,
      description: description,
      priority: analysis.priority,
      weight: analysis.estimatedWeight,
      state: State.NEW,
      location: { connect: { id: locationId } },
      creator: { connect: { id: reporterId } },
      department: { connect: { id: departmentId } },
      tags: analysis.tags,
      ...(technician && {
        assignee: { connect: { user_id: technician.user_id } },
      }),
    };

    return this.prisma.task.create({
      data: taskData,
      include: {
        department: true,
        assignee: true,
        location: true,
      },
    });
  }

  async update(
    taskId: string,
    updateData: UpdateTaskDto,
    updaterData: User,
  ): Promise<Task> {
    if (!taskId || !updateData || !Object.keys(updateData).length) {
      throw new BadRequestException('Task id must be supply.');
    }
    const currentTask = await this.prisma.task.findUnique({
      where: {
        id: taskId,
      },
    });

    if (updaterData.role === 'REPORTER') {
      const allowedFields = ['description', 'location_id'];
      const attemptingForbidden = Object.keys(updateData).some(
        (key) => !allowedFields.includes(key),
      );

      if (attemptingForbidden) {
        throw new ForbiddenException('Action not allowed');
      }
    }

    const auditRecords: Partial<Record>[] = [];
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== currentTask?.[key]) {
        auditRecords.push({
          task_id: taskId,
          updated_attribute: key,
          previous_value: currentTask?.[key] as string,
          current_value: updateData[key] as string,
          updated_by: updaterData.id,
        });
      }
    });

    return this.prisma.$transaction(async (trx) => {
      const updatedTask = await trx.task.update({
        where: { id: taskId },
        data: updateData as unknown as Task,
      });

      if (auditRecords.length) {
        await trx.record.createMany({ data: auditRecords as Record[] });
      }

      if (
        updateData.department_id &&
        updateData.department_id !== currentTask?.department_id
      ) {
        await trx.task.update({
          where: { id: taskId },
          data: { assigned_to_id: null, state: 'OPEN' },
        });

        if (currentTask?.assigned_to_id) {
          const technical = await trx.technicalProfile.findFirst({
            where: { user_id: currentTask?.assigned_to_id },
          });
          await trx.technicalProfile.update({
            where: { user_id: currentTask?.assigned_to_id },
            data: {
              current_load: (technical?.current_load || 0) - currentTask.weight,
            },
          });
        }
      }

      return updatedTask;
    });
  }
}
