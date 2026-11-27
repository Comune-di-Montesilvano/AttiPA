import { Module } from '@nestjs/common';
import { TinnModule } from '../tinn/tinn.module.js';
import { TinnToolsService } from './tinn-tools.service.js';

@Module({
  imports: [TinnModule],
  providers: [TinnToolsService],
  exports: [TinnToolsService],
})
export class ToolsModule {}
