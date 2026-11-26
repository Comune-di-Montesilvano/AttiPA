import { Controller, Get } from '@nestjs/common';
import type { VersionInfo } from '@attipa/shared-types';

@Controller()
export class AppController {
  @Get()
  getHealth(): string {
    return 'OK';
  }

  @Get('version')
  getVersion(): VersionInfo {
    return { version: process.env['APP_VERSION'] || 'dev' };
  }
}
