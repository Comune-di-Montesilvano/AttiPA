import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { OperatorRole } from '@attipa/shared-types';

/** Operatore che ha fatto almeno un login (anagrafica da AD, aggiornata a ogni accesso). */
@Entity('users')
export class User {
  /** sAMAccountName in minuscolo. */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  username!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: OperatorRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz' })
  lastLoginAt!: Date;
}
