import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  @Length(1, 100)
  @Matches(/\S/, { message: 'nome vuoto' })
  name!: string;

  /** Giorni di validità (limite superiore da MCP_TOKEN_MAX_DAYS, controllato nel servizio). */
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}
