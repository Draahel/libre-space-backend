import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  async login(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Omit<User, 'createdAt' | 'updatedAt'>;
  }> {
    const { id, email, full_name, role, image } = user;
    const payload = { sub: id, email, role };

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      },
    );

    const salt = await bcrypt.genSalt(10);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);

    await this.prisma.account.update({
      data: {
        refresh_token: hashedRefreshToken,
      },
      where: {
        user_id: id,
      },
    });

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
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

  async refresToken(userId: string, refreshToken: string) {
    const account = await this.prisma.account.findUnique({
      where: { user_id: userId },
      include: { user: true },
    });

    if (!account?.refresh_token) {
      throw new UnauthorizedException('Refresh token invalid');
    }
    const plainRefreshToken = await bcrypt.compare(
      refreshToken,
      account.refresh_token,
    );

    if (!plainRefreshToken) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    return this.login(account.user);
  }
}
