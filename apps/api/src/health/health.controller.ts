import { Controller, Get } from '@nestjs/common';
import type { Health } from '@lenseignement/types';
import { Public } from '../auth/public.decorator.js';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  get(): Health {
    return {
      status: 'ok',
      service: 'lenseignement-api',
      version: process.env.npm_package_version ?? '0.1.0',
      time: new Date().toISOString(),
    };
  }
}
