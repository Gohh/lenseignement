import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { loadConfig } from '../config.js';
import { AuthGuard } from './auth.guard.js';
import { TOKEN_VERIFIER, TokenVerifier } from './token-verifier.js';

@Module({
  providers: [
    {
      provide: TOKEN_VERIFIER,
      useFactory: () => {
        const config = loadConfig();
        return TokenVerifier.fromIssuer(config.OIDC_ISSUER_URL, config.OIDC_AUDIENCE);
      },
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
