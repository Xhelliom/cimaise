import { Counter } from './shapes';

declare var __out: { value: unknown };

export function label(n: number, prefix = 'total'): string {
  return `${prefix}=${n}`;
}

const nums = [1, 2, 3];
const double = (x: number) => x * 2;
let c = new Counter(10);
const more = [4, ...nums.map(double)];
c = c.add(...more);
__out.value = c.describe();
