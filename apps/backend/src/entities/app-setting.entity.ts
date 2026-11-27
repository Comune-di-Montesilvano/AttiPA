import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Impostazioni dell'istanza (chiave → valore JSON). */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'varchar', length: 128, nullable: true })
  updatedBy!: string | null;
}
