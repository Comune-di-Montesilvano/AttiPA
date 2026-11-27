import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { ToolsModule } from '../tools/tools.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [LlmModule, ToolsModule],
  providers: [AssistantService],
  controllers: [AssistantController],
})
export class AssistantModule {}
