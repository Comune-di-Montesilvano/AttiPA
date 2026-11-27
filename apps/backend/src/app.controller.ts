import { Controller, Get } from '@nestjs/common';
import type { VersionInfo } from '@attipa/shared-types';
import { Public } from './auth/decorators/public.decorator.js';

@Controller()
export class AppController {
  @Public()
  @Get()
  getHealth(): string {
    return 'OK';
  }

  @Public()
  @Get('version')
  getVersion(): VersionInfo {
    return { version: process.env['APP_VERSION'] || 'dev' };
  }
}
