import { dark, light } from '@/theme/tokens';

describe('palette parity', () => {
  it('light and dark expose exactly the same keys', () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });
});
