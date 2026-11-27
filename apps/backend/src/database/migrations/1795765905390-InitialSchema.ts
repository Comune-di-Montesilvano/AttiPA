import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795765905390 implements MigrationInterface {
  name = 'InitialSchema1795765905390';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // pgvector (immagine pgvector/pgvector): embedding di regolamenti e atti.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("key" character varying(128) NOT NULL, "value" jsonb NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" character varying(128), CONSTRAINT "PK_975c2db59c65c05fd9c6b63a2ab" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("username" character varying(100) NOT NULL, "display_name" character varying(255) NOT NULL, "role" character varying(16) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "last_login_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_fe0bb3f6520ee0469504521e710" PRIMARY KEY ("username"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS vector`);
  }
}
