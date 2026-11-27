import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module.js';
import { ToolsModule } from '../tools/tools.module.js';
import { McpController } from './mcp.controller.js';
import { McpService } from './mcp.service.js';

@Module({
  imports: [ToolsModule, TokensModule],
  providers: [McpService],
  controllers: [McpController],
})
export class McpModule {}
