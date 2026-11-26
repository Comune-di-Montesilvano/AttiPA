// Alias globale `jest` → `vi`: gli spec usano l'API jest (jest.fn, jest.spyOn,
// jest.stubGlobal...) come in ComunicaPA.
import { vi } from 'vitest';

(globalThis as unknown as { jest: typeof vi }).jest = vi;
