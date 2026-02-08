import { Injectable } from '@nestjs/common';
import { Account, PrismaClient, User } from '@prisma/client';

type UserWithAccount = User & { account: Account | null };

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}
  findOneUserWithAccount(email: string): Promise<UserWithAccount | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { account: true },
    });
  }
}
