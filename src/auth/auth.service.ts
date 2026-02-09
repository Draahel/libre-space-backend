import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AzureProfileDto } from './dto/azure-profile.dto';
import { PrismaService } from 'src/common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const account = await this.prisma.account.findFirst({
      where: {
        user: { email },
        provider: 'LOCAL',
      },
      include: { user: true },
    });
    if (!account) return null;
    const isMatch = await bcrypt.compare(password, account.password || '');
    if (!isMatch) return null;
    return account.user;
  }

  login(user: User): {
    accessToken: string;
    user: Omit<User, 'createdAt' | 'updatedAt'>;
  } {
    const { id, email, full_name, role, image } = user;
    const payload = { sub: id, email, role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id,
        email,
        full_name,
        role,
        image,
      },
    };
  }

  async valideAzureUser(azureProfile: AzureProfileDto): Promise<User> {
    const { email, displayName, oid } = azureProfile;
    const account = await this.prisma.account.findFirst({
      where: {
        provider: 'AZURE_ENTRA_ID',
        user_id: oid,
      },
      include: { user: true },
    });
    if (!account) {
      return await this.prisma.user.create({
        data: {
          id: oid,
          email,
          full_name: displayName,
          account: {
            create: {
              provider: 'AZURE_ENTRA_ID',
            },
          },
        },
      });
    }
    return account.user;
  }
}
