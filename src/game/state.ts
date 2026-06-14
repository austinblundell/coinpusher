import { JACKPOT_COUNT, JACKPOT_WINDOW } from "../config";

// Lightweight game state. The player has unlimited quarters, so the only thing
// we track is total winnings (plus jackpot bookkeeping).
export class GameState {
  winnings = 0; // dollars won from the collector

  onChange: (() => void) | null = null;
  onJackpot: (() => void) | null = null;

  private payoutTimes: number[] = [];

  // Called when a coin or prize lands in the collector. `now` is the clock time.
  award(value: number, now: number) {
    this.winnings += value;
    this.onChange?.();

    this.payoutTimes.push(now);
    while (this.payoutTimes.length && now - this.payoutTimes[0] > JACKPOT_WINDOW) {
      this.payoutTimes.shift();
    }
    if (this.payoutTimes.length >= JACKPOT_COUNT) {
      this.payoutTimes.length = 0;
      this.onJackpot?.();
    }
  }
}
