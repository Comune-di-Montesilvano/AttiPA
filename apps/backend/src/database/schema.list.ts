import { ApiToken } from '../entities/api-token.entity.js';
import { AppSetting } from '../entities/app-setting.entity.js';
import { User } from '../entities/user.entity.js';
import { InitialSchema1795765905390 } from './migrations/1795765905390-InitialSchema.js';
import { ApiTokens1795862400000 } from './migrations/1795862400000-ApiTokens.js';

// Elenco esplicito (niente glob): stesso set per runtime, CLI e test.
// database.module.migrations.spec.ts controlla che nessun file resti fuori.
export const ENTITIES = [AppSetting, User, ApiToken];

/** In ordine di timestamp: migrations.integration.spec.ts annulla l'ultima. */
export const MIGRATIONS = [InitialSchema1795765905390, ApiTokens1795862400000];
