import { Controller, Get } from '@nestjs/common';
import type { LlmStatus } from '@attipa/shared-types';
import { LlmService } from './llm.service.js';

@Controller('llm')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Get('status')
  status(): Promise<LlmStatus> {
    return this.llm.status();
  }
}
