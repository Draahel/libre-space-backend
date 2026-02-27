export interface TaskMetadata {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  totalPages: number;
}

export interface TaskStats {
  byPriority: Record<string, number>;
  byState: Record<string, number>;
}

export interface PaginatedTaskResponse {
  data: any[];
  meta: TaskMetadata;
  stats?: TaskStats;
}

export interface TaskHistoryRecord {
  id: string;
  taskId: string;
  updatedAttribute: string;
  previousValue: string | null;
  currentValue: string;
  updatedBy: {
    id?: string;
    fullName?: string;
  };
  updateDate: Date;
}
