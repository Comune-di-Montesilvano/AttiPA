import { Body, Controller, Get, HttpCode, HttpStatus, Post, Request } from '@nestjs/common';
import type { AuthResponse, JwtOperatorPayload } from '@attipa/shared-types';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@Request() req: { user: JwtOperatorPayload }): JwtOperatorPayload {
    return req.user;
  }
}
