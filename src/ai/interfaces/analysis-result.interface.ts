export interface AIAnalysisResult {
  title: string;
  suggestedDepartment: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedWeight: number; // 1-10 scale
  tags: string[];
}
