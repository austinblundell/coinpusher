// Thin wrapper over the DOM overlay declared in index.html.
export class Hud {
  private winningsEl = document.getElementById("winnings")!;
  private jackpotEl = document.getElementById("jackpot")!;
  private floatersEl = document.getElementById("floaters")!;
  private hudEl = document.getElementById("hud")!;
  private loaderEl = document.getElementById("loader")!;

  // Smoothly animated displayed winnings.
  private shownWinnings = 0;
  private targetWinnings = 0;

  reveal() {
    this.loaderEl.classList.add("gone");
    this.hudEl.classList.remove("hidden");
    setTimeout(() => this.loaderEl.remove(), 700);
  }

  setWinnings(value: number) {
    this.targetWinnings = value;
  }

  // Called every frame to ease the cash counter toward its target.
  tick() {
    if (Math.abs(this.shownWinnings - this.targetWinnings) > 0.0005) {
      this.shownWinnings += (this.targetWinnings - this.shownWinnings) * 0.18;
      if (Math.abs(this.shownWinnings - this.targetWinnings) < 0.005) {
        this.shownWinnings = this.targetWinnings;
      }
      this.winningsEl.textContent =
        "$" + this.shownWinnings.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }

  showJackpot() {
    this.jackpotEl.classList.remove("hidden", "show");
    void this.jackpotEl.offsetWidth; // reflow to restart the animation
    this.jackpotEl.classList.add("show");
  }

  floater(text: string, x: number, y: number, loss = false) {
    const el = document.createElement("div");
    el.className = "floater" + (loss ? " loss" : "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    this.floatersEl.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}
