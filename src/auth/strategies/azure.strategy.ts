/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { BearerStrategy } from 'passport-azure-ad';
import { AuthService } from '../auth.service';

@Injectable()
export class AzureAuthStrategy extends PassportStrategy(
  BearerStrategy,
  'azure-ad',
) {
  constructor(private readonly authService: AuthService) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      clientID: process.env.AZURE_CLIENT_ID,
      audience: `api://${process.env.AZURE_CLIENT_ID}`,
      loggingLevel: 'error',
      loggingNoPII: false,
      issuer: `https://sts.windows.net/${process.env.AZURE_TENANT_ID}/`,
      passReqToCallback: false,
    });
  }

  async validate(data: any) {
    const { email, name, oid } = data;

    const user = await this.authService.valideAzureUser({
      email,
      displayName: name,
      oid,
    });

    return user;
  }
}
