/**
 * Tracks the ref counter across extract calls within a session.
 * The actual ref strings (e1, e2...) are stored as data-surf-ref attributes
 * on DOM elements via page.evaluate(), so they survive between Node.js calls.
 */
export class RefCounter {
  private _count = 0;

  get count(): number {
    return this._count;
  }

  advance(to: number): void {
    this._count = to;
  }

  reset(): void {
    this._count = 0;
  }
}
