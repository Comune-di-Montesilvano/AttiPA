import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  // Finisce nel DN/UPN del bind: niente virgole, uguali, spazi o altri caratteri DN.
  @IsString()
  @Matches(/^[A-Za-z0-9._@-]{1,100}$/, { message: 'Username non valido' })
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password!: string;
}
