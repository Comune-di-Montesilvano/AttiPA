import { Controller, Get } from '@nestjs/common';
import type { TinnInfo } from '@attipa/shared-types';
import { TinnService } from './tinn.service.js';

@Controller('tinn')
export class TinnController {
  constructor(private readonly tinn: TinnService) {}

  @Get('info')
  info(): Promise<TinnInfo> {
    return this.tinn.info();
  }
}
