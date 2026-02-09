import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { AIAnalysisResult } from './interfaces/analysis-result.interface';

@Injectable()
export class AiService {
  private readonly genAi: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    this.genAi = new GoogleGenerativeAI(apiKey);
    this.model = this.genAi.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async analizyIncident(
    description: string,
    departments: string[],
    image?: { buffer: Buffer; mimeType: string },
  ): Promise<AIAnalysisResult> {
    const prompt = `Analyze the following incident description and return only a JSON object with the following fields:
      - title: a concise title summarizing the incident
      - suggestedDepartment: one of the following: ${departments.join(', ')}
      - priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      - estimatedWeight: number (1-10 scale)
      - tags: string[]

    Incident Description: ${description}`;

    const contentParts: any[] = [prompt];
    if (image) {
      contentParts.push({
        inlineData: {
          data: image.buffer.toString('base64'),
          mimeType: image.mimeType,
        },
      });
    }
    try {
      const result = await this.model.generateContent(contentParts);
      const text = result.response.text();
      return JSON.parse(
        text.replace(/```json|```/g, '').trim(),
      ) as AIAnalysisResult;
    } catch (error) {
      console.error('Failed to analyze incident with AI', error);
      throw new InternalServerErrorException(
        'Failed to analyze incident with AI',
      );
    }
  }
}
