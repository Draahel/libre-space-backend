import { Injectable } from '@nestjs/common';
import { Prisma, State, Task } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AiService } from 'src/ai/ai.service';
import { AIAnalysisResult } from 'src/ai/interfaces/analysis-result.interface';
import { CreateTaskDto } from './dto/create-task.dto';

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
}
