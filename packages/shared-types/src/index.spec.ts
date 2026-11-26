import { formatEuro } from './index';

describe('formatEuro', () => {
  it('punto per le migliaia (anche sotto 10.000) e virgola per i decimali', () => {
    expect(formatEuro(1234.56)).toBe('1.234,56 €');
    expect(formatEuro(1234567)).toBe('1.234.567,00 €');
    expect(formatEuro(0)).toBe('0,00 €');
  });

  it('arrotonda al centesimo i double di Firebird dialect 1', () => {
    expect(formatEuro(75.65000000000001)).toBe('75,65 €');
  });

  it('importi negativi (variazioni in diminuzione)', () => {
    expect(formatEuro(-1500.5)).toBe('-1.500,50 €');
  });
});
