import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from './user.entity.js';

/**
 * Token personale per i client MCP (Claude Desktop/Code, ChatGPT…). Il token in chiaro è
 * mostrato una sola volta alla creazione: qui solo lo SHA-256 (token casuali a 256 bit, un
 * hash lento non serve) e un prefisso per riconoscerlo nell'elenco.
 */
@Entity('api_tokens')
export class ApiToken {
  /** randomUUID() dell'app: niente estensione uuid-ossp. */
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'username', referencedColumnName: 'username' })
  user?: User;

  /** Nome dato dall'operatore (es. «Claude Desktop ufficio»). */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  /** Primi caratteri del token, per riconoscerlo. */
  @Column({ type: 'varchar', length: 16 })
  prefix!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
