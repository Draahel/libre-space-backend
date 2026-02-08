import { Module } from '@nestjs/common';
import { JwtStrategyService } from './strategies/jwt.strategy/jwt.strategy.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      global: true,
      secret: 'your_jwt_secret_key',
      signOptions: { expiresIn: '60s' },
    }),
  ],
  providers: [JwtStrategyService, AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
