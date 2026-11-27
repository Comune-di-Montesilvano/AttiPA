import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { TinnModule } from '../tinn/tinn.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [LlmModule, TinnModule],
  providers: [AssistantService],
  controllers: [AssistantController],
})
export class AssistantModule {}
