import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { compare } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { SignInDto } from './dto/sign-in.dto';

type AccesToken = { accessToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signInLocal(signInDto: SignInDto): Promise<AccesToken> {
    const { email, password } = signInDto;
    const userAccount = await this.usersService.findOneUserWithAccount(email);
    if (!userAccount) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const account = userAccount.account;
    if (account?.password) {
      const isMatch = await compare(password, account.password);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid email or password');
      }
    }
    const payload = { sub: userAccount.id, email: userAccount.email };
    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }

  async signInMsAzure() {}
}
