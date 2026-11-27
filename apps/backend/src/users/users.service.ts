import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User } from '../entities/user.entity.js';
import type { LdapUser } from '../auth/ldap/ldap.service.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  /** Crea o aggiorna l'operatore con i dati AD del login. */
  async recordLogin(user: LdapUser, now: Date = new Date()): Promise<void> {
    await this.repo.upsert(
      { username: user.username, displayName: user.displayName, role: user.role, lastLoginAt: now },
      ['username'],
    );
  }
}
