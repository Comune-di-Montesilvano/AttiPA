import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import type { AssistantChatResponse, JwtOperatorPayload } from '@attipa/shared-types';
import { AssistantService } from './assistant.service.js';
import { ChatDto } from './dto/chat.dto.js';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  chat(@Body() dto: ChatDto, @Request() req: { user: JwtOperatorPayload }): Promise<AssistantChatResponse> {
    if (dto.messages.at(-1)?.role !== 'user') throw new BadRequestException("L'ultimo messaggio deve essere dell'utente");
    return this.assistant.chat(dto.messages, req.user.username);
  }
}
