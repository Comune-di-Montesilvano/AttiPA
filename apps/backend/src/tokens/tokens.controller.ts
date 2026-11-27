import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import type { ApiTokensResponse, CreatedApiToken, JwtOperatorPayload } from '@attipa/shared-types';
import { CreateTokenDto } from './dto/create-token.dto.js';
import { TokensService } from './tokens.service.js';

/** Token personali dell'operatore loggato (ognuno vede e revoca solo i propri). */
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  @Get()
  list(@Request() req: { user: JwtOperatorPayload }): Promise<ApiTokensResponse> {
    return this.tokens.list(req.user.username);
  }

  @Post()
  create(@Body() dto: CreateTokenDto, @Request() req: { user: JwtOperatorPayload }): Promise<CreatedApiToken> {
    return this.tokens.create(req.user.username, dto.name, dto.days);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: { user: JwtOperatorPayload }): Promise<void> {
    return this.tokens.revoke(req.user.username, id);
  }
}
