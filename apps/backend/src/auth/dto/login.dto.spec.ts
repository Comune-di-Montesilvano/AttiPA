import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LoginDto } from './login.dto.js';

const errors = (body: object) => validateSync(plainToInstance(LoginDto, body)).map((e) => e.property);

describe('LoginDto', () => {
  it('accetta sAMAccountName e UPN', () => {
    expect(errors({ username: 'm.rossi', password: 'x' })).toEqual([]);
    expect(errors({ username: 'm.rossi@comune.local', password: 'x' })).toEqual([]);
  });

  it('rifiuta caratteri che alterano il DN del bind e password vuota', () => {
    for (const username of ['a,OU=x', 'a=b', 'a b', 'a\\b', '', 'x'.repeat(101)]) {
      expect(errors({ username, password: 'x' })).toEqual(['username']);
    }
    expect(errors({ username: 'mario', password: '' })).toEqual(['password']);
  });
});
