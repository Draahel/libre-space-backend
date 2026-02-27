import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  Record as PrismaRecord,
  State,
  Task,
  User,
} from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { AiService } from 'src/ai/ai.service';
import { AIAnalysisResult } from 'src/ai/interfaces/analysis-result.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import {
  PaginatedTaskResponse,
  TaskMetadata,
  TaskStats,
  TaskHistoryRecord,
} from './interfaces/task-response.interface';

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
  ): Promise<Record<string, unknown>> {
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

    const newTask = await this.prisma.task.create({
      data: taskData,
      include: {
        creator: { select: { id: true, full_name: true } },
        assignee: {
          select: {
            user: { select: { id: true, full_name: true } },
          },
        },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, type: true } },
      },
    });

    return this.formatTaskResponse(newTask, true);
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

    const auditRecords: Partial<PrismaRecord>[] = [];
    Object.keys(updateData).forEach((key) => {
      const updateValue = (updateData as Record<string, unknown>)[key];
      const currentValue = (currentTask as Record<string, unknown>)?.[key];
      if (updateValue !== currentValue) {
        auditRecords.push({
          task_id: taskId,
          updated_attribute: key,
          previous_value: currentValue as string,
          current_value: updateValue as string,
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
        await trx.record.createMany({ data: auditRecords as PrismaRecord[] });
      }

      const updateDataRecord = updateData as Record<string, unknown>;
      const currentTaskRecord = currentTask as Record<string, unknown>;
      if (
        updateDataRecord.department_id &&
        updateDataRecord.department_id !== currentTaskRecord?.department_id
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

  /**
   * Obtiene una tarea específica por ID
   */
  async getTaskById(
    taskId: string,
    user: User,
  ): Promise<Record<string, unknown>> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        creator: { select: { id: true, full_name: true } },
        assignee: {
          select: {
            user: { select: { id: true, full_name: true } },
          },
        },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, type: true } },
      },
    });

    if (!task) {
      throw new BadRequestException('Task not found');
    }

    // Técnicos solo pueden ver tareas de su departamento
    if (user.role === 'MAINTENANCE') {
      const techProfile = await this.prisma.technicalProfile.findUnique({
        where: { user_id: user.id },
      });
      if (!techProfile || techProfile.department_id !== task.department_id) {
        throw new ForbiddenException('Access denied');
      }
    }

    return this.formatTaskResponse(task, true);
  }

  /**
   * Obtiene tareas con filtros dinámicos y paginación
   */
  async getTasks(
    queryDto: TaskQueryDto,
    user: User,
  ): Promise<PaginatedTaskResponse> {
    const {
      reportedBy,
      assignedTo,
      state,
      priority,
      dateFrom,
      dateTo,
      department,
      page = 1,
      limit = 10,
      sort = 'created_at:desc',
      select,
      includeTimestamps = false,
    } = queryDto;

    // Validar paginación
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    // Construir where conditions
    const where: Prisma.TaskWhereInput = {};

    if (reportedBy) {
      where.created_by_id = reportedBy;
    }

    if (assignedTo) {
      where.assigned_to_id = assignedTo;
    }

    if (state) {
      where.state = state as State;
    }

    if (priority) {
      where.priority = priority as Prisma.TaskWhereInput['priority'];
    }

    // Si es técnico, filtrar por su departamento
    if (user.role === 'MAINTENANCE') {
      const techProfile = await this.prisma.technicalProfile.findUnique({
        where: { user_id: user.id },
      });
      if (techProfile) {
        where.department_id = techProfile.department_id;
      }
    } else if (department) {
      // Otros usuarios pueden filtrar por departamento si lo especifican
      where.department_id = department;
    }

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      where.created_at = {};
      if (dateFrom) {
        where.created_at.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.created_at.lte = endDate;
      }
    }

    // Parsear select
    const selectedFields = this.parseSelectFields(select);

    // Parsear sort
    const [sortField, sortOrder] = sort.split(':');
    const orderBy: Prisma.TaskOrderByWithRelationInput = {};
    const fieldName = (sortField ||
      'created_at') as keyof Prisma.TaskOrderByWithRelationInput;
    orderBy[fieldName] = (
      sortOrder || 'desc'
    ).toLowerCase() as Prisma.SortOrder;

    // Obtener tareas
    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        include: this.buildInclude(selectedFields),
      }),
      this.prisma.task.count({ where }),
    ]);

    // Procesar campos seleccionados
    const processedTasks = this.projectFields(
      tasks,
      selectedFields,
      includeTimestamps,
    );

    // Calcular estadísticas
    const stats = await this.getTaskStats(where);

    const metadata: TaskMetadata = {
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + limitNum < total,
      totalPages: Math.ceil(total / limitNum),
    };

    return {
      data: processedTasks,
      meta: metadata,
      stats,
    };
  }

  /**
   * Obtiene el historial de una tarea
   */
  async getTaskHistory(
    taskId: string,
    user: User,
    limit: number = 50,
    select?: string,
  ): Promise<TaskHistoryRecord[]> {
    // Verificar que el usuario tenga acceso a la tarea
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { department: true },
    });

    if (!task) {
      throw new BadRequestException('Task not found');
    }

    // Técnicos solo pueden ver tareas de su departamento
    if (user.role === 'MAINTENANCE') {
      const techProfile = await this.prisma.technicalProfile.findUnique({
        where: { user_id: user.id },
      });
      if (!techProfile || techProfile.department_id !== task.department_id) {
        throw new ForbiddenException('Access denied');
      }
    }

    const records = await this.prisma.record.findMany({
      where: { task_id: taskId },
      take: limit,
      orderBy: { update_date: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
    });

    const selectedFields = this.parseSelectFields(select);

    return records.map((record) =>
      this.projectHistoryRecord(record, selectedFields),
    );
  }

  /**
   * Obtiene estadísticas de tareas
   */
  async getTaskStats(where?: Prisma.TaskWhereInput): Promise<TaskStats> {
    const [byPriority, byState] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['state'],
        where,
        _count: true,
      }),
    ]);

    const stats: TaskStats = {
      byPriority: {},
      byState: {},
    };

    byPriority.forEach((item) => {
      stats.byPriority[item.priority] = item._count;
    });

    byState.forEach((item) => {
      stats.byState[item.state] = item._count;
    });

    return stats;
  }

  /**
   * Obtiene resumen rápido de tareas por prioridad
   */
  async getPrioritySummary(user: User): Promise<Record<string, number>> {
    const where: Prisma.TaskWhereInput = {};

    if (user.role === 'MAINTENANCE') {
      const techProfile = await this.prisma.technicalProfile.findUnique({
        where: { user_id: user.id },
      });
      if (techProfile) {
        where.department_id = techProfile.department_id;
      }
    }

    const result = await this.prisma.task.groupBy({
      by: ['priority'],
      where,
      _count: true,
    });

    const summary: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    result.forEach((item) => {
      summary[item.priority] = item._count;
    });

    return summary;
  }

  // ============ MÉTODOS HELPER ============

  private parseSelectFields(select?: string): string[] {
    if (!select) return [];
    return select
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field);
  }

  private buildInclude(selectedFields: string[]) {
    const fieldMap: Record<string, Record<string, unknown>> = {
      creator: { select: { id: true, full_name: true, email: true } },
      assignee: {
        select: {
          id: true,
          user_id: true,
          user: { select: { id: true, full_name: true } },
        },
      },
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true, type: true } },
    };

    if (selectedFields.length === 0) {
      // Por defecto incluir relaciones principales
      return {
        creator: { select: { id: true, full_name: true } },
        assignee: {
          select: {
            user: { select: { id: true, full_name: true } },
          },
        },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, type: true } },
      };
    }

    const include: Record<string, Record<string, unknown>> = {};
    selectedFields.forEach((field) => {
      const baseField = field.split('.')[0];
      if (fieldMap[baseField]) {
        include[baseField] = fieldMap[baseField];
      }
    });

    return include;
  }

  private projectFields(
    tasks: Task[],
    selectedFields: string[],
    includeTimestamps: boolean,
  ): Record<string, unknown>[] {
    if (selectedFields.length === 0) {
      // Retornar todo pero estructurado
      return tasks.map((task) =>
        this.formatTaskResponse(task, includeTimestamps),
      );
    }

    return tasks.map((task) => {
      const projected: Record<string, unknown> = {};

      selectedFields.forEach((field) => {
        if (field.includes('.')) {
          // Relaciones anidadas como "assignee.user.full_name"
          const parts = field.split('.');
          let value: unknown = task;

          for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
              value = (value as Record<string, unknown>)[part];
            } else {
              value = undefined;
              break;
            }
          }

          if (value !== undefined) {
            const lastPart = parts[parts.length - 1];
            const parent = parts[parts.length - 2];
            if (!projected[parent]) {
              projected[parent] = {};
            }
            (projected[parent] as Record<string, unknown>)[lastPart] = value;
          }
        } else {
          // Campo directo
          projected[field] = (task as Record<string, unknown>)[field];
        }
      });

      if (includeTimestamps) {
        projected.created_at = task.created_at;
      }

      return projected;
    });
  }

  private formatTaskResponse(
    task: Task & {
      creator?: { id: string; full_name: string };
      assignee?: { user?: { id: string; full_name: string } } | null;
      department?: { id: string; name: string };
      location?: { id: string; name: string; type: string };
    },
    includeTimestamps: boolean,
  ): Record<string, unknown> {
    const response: Record<string, unknown> = {
      id: task.id,
      title: task.title,
      description: task.description,
      state: task.state,
      priority: task.priority,
      weight: task.weight,
      tags: task.tags,
    };

    // Incluir relaciones si existen
    if (task.location) {
      response.location = {
        id: task.location.id,
        name: task.location.name,
        type: task.location.type,
      };
    }

    if (task.department) {
      response.department = {
        id: task.department.id,
        name: task.department.name,
      };
    }

    if (task.creator) {
      response.creator = {
        id: task.creator.id,
        fullName: task.creator.full_name,
      };
    }

    if (task.assignee) {
      response.assignee = {
        id: task.assignee.user?.id,
        fullName: task.assignee.user?.full_name,
      };
    }

    if (includeTimestamps) {
      response.created_at = task.created_at;
    }

    return response;
  }

  private projectHistoryRecord(
    record: PrismaRecord & { user?: { id: string; full_name: string } },
    selectedFields: string[],
  ): TaskHistoryRecord {
    if (selectedFields.length === 0) {
      return {
        id: record.id,
        taskId: record.task_id,
        updatedAttribute: record.updated_attribute,
        previousValue: record.previous_value,
        currentValue: record.current_value,
        updatedBy: {
          id: record.user?.id,
          fullName: record.user?.full_name,
        },
        updateDate: record.update_date,
      };
    }

    const projected: Partial<TaskHistoryRecord> = {};
    selectedFields.forEach((field) => {
      switch (field) {
        case 'id':
          projected.id = record.id;
          break;
        case 'taskId':
          projected.taskId = record.task_id;
          break;
        case 'updatedAttribute':
          projected.updatedAttribute = record.updated_attribute;
          break;
        case 'previousValue':
          projected.previousValue = record.previous_value;
          break;
        case 'currentValue':
          projected.currentValue = record.current_value;
          break;
        case 'updatedBy':
          projected.updatedBy = {
            id: record.user?.id,
            fullName: record.user?.full_name,
          };
          break;
        case 'updateDate':
          projected.updateDate = record.update_date;
          break;
      }
    });

    return projected as TaskHistoryRecord;
  }
}
