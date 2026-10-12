import { formatInr, groupIndian } from '@/lib/money';

describe('groupIndian', () => {
  it('leaves 3-or-fewer digits unchanged', () => {
    expect(groupIndian('123')).toBe('123');
  });

  it('groups 4 digits as 1,234', () => {
    expect(groupIndian('1234')).toBe('1,234');
  });

  it('groups 6 digits as 1,23,456', () => {
    expect(groupIndian('123456')).toBe('1,23,456');
  });

  it('groups 7 digits as 12,34,567', () => {
    expect(groupIndian('1234567')).toBe('12,34,567');
  });

  it('groups 9 digits as 12,34,56,789', () => {
    expect(groupIndian('123456789')).toBe('12,34,56,789');
  });
});

describe('formatInr', () => {
  it('formats zero as ₹0', () => {
    expect(formatInr(0)).toBe('₹0');
  });

  it('formats 84216000 paise as ₹8,42,160', () => {
    expect(formatInr(84216000)).toBe('₹8,42,160');
  });

  it('prefixes negative amounts with -', () => {
    expect(formatInr(-412000).startsWith('-')).toBe(true);
  });

  it('appends .50 when decimals are requested', () => {
    expect(formatInr(84216050, { decimals: true }).endsWith('.50')).toBe(true);
  });
});
