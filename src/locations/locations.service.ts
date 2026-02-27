import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { LocationResponse } from './interfaces/location-response.interface';
import { type Location } from '@prisma/client';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLocations(): Promise<LocationResponse[]> {
    const locations = await this.prisma.location.findMany();

    return locations
      .filter((location) => !location.parent_id)
      .map<LocationResponse>((location) => ({
        id: location.id,
        name: location.name,
        type: location.type,
        childs: this.loadChilds(location.id, locations),
      }));
  }

  private loadChilds(
    parentId: string,
    locations: Location[],
  ): LocationResponse[] | undefined {
    const existChild = locations.some(
      (location) => location.parent_id === parentId,
    );
    if (existChild) {
      return locations
        .filter((location) => location.parent_id === parentId)
        .map<LocationResponse>((location) => ({
          id: location.id,
          name: location.name,
          type: location.type,
          childs: this.loadChilds(location.id, locations),
        }));
    } else {
      return undefined;
    }
  }
}
