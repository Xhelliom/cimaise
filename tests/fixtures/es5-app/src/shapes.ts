import { label } from './index';

export class Counter {
  private n: number;
  constructor(start = 0) {
    this.n = start;
  }
  add(...xs: number[]): this {
    for (const x of xs) this.n += x;
    return this;
  }
  describe(): string {
    return label(this.n);
  }
}
