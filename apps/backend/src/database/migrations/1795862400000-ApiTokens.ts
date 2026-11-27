import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Token personali per il server MCP (solo hash). */
export class ApiTokens1795862400000 implements MigrationInterface {
  name = 'ApiTokens1795862400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "api_tokens" ("id" uuid NOT NULL, "username" character varying(100) NOT NULL, "name" character varying(100) NOT NULL, "token_hash" character(64) NOT NULL, "prefix" character varying(16) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "last_used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_c587455266b5fa8dace7194caac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_2e73d8f9f818c6b66d02fa6b9a" ON "api_tokens" ("username")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_bbd687a104e1921e6702c6e3aa" ON "api_tokens" ("token_hash")`);
    await queryRunner.query(
      `ALTER TABLE "api_tokens" ADD CONSTRAINT "FK_2e73d8f9f818c6b66d02fa6b9ad" FOREIGN KEY ("username") REFERENCES "users"("username") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_tokens"`);
  }
}
