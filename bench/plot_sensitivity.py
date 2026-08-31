"""
Phase 2 plot: renders results/sensitivity.json into paper/figures/sensitivity.pdf.

x = allergy count, y = totalTagBytes (V3 encoding), one line per contact
count, horizontal reference line at the 504B NTAG215 budget. Points beyond
allergy count 12 reuse curated allergen names (see sensitivity.ts) to locate
the byte-budget crossover and are drawn with a dashed line style + hollow
markers to visually distinguish them from the clinically-realistic range.

Run via: python bench/plot_sensitivity.py  (after `npm run bench:sensitivity`)
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)

with open(os.path.join(REPO_ROOT, "results", "sensitivity.json"), "r", encoding="utf-8") as f:
    data = json.load(f)

cells = data["cells"]
budget = data["meta"]["ntag215BudgetBytes"]
contact_counts = data["meta"]["contactCounts"]

fig, ax = plt.subplots(figsize=(6, 4))

colors = {1: "#1b6ca8", 2: "#c1440e", 3: "#2e8b57"}

for cc in contact_counts:
    row = sorted([c for c in cells if c["contactCount"] == cc], key=lambda c: c["allergyCount"])
    realistic = [c for c in row if c["withinCuratedRealism"]]
    extended = [c for c in row if not c["withinCuratedRealism"]]

    rx = [c["allergyCount"] for c in realistic]
    ry = [c["totalTagBytes"] for c in realistic]
    ax.plot(rx, ry, marker="o", color=colors[cc], linewidth=2, label=f"{cc} contact{'s' if cc != 1 else ''}")

    # Bridge + extended (repeated-name) segment, dashed/hollow to mark it as
    # the non-clinically-realistic crossover-finding extension.
    if extended:
        bridge_x = [rx[-1]] + [c["allergyCount"] for c in extended]
        bridge_y = [ry[-1]] + [c["totalTagBytes"] for c in extended]
        ax.plot(bridge_x, bridge_y, marker="o", markerfacecolor="white",
                 color=colors[cc], linewidth=1.5, linestyle="--")

ax.axhline(budget, color="black", linewidth=1.2, linestyle=":")
ax.text(0.5, budget + 8, f"NTAG215 budget ({budget} B)", fontsize=9, va="bottom")

ax.axvline(12, color="gray", linewidth=0.8, linestyle=":")
ax.text(12.3, ax.get_ylim()[0] if ax.get_ylim()[0] > 0 else 10, "curated realism\nlimit (12)",
        fontsize=7.5, color="gray", va="bottom")

ax.set_xlabel("Allergy entries")
ax.set_ylabel("Total tag bytes (V3 encoding)")
ax.set_title("Payload size vs. allergy count and contact count (V3)")
ax.legend(loc="upper left", fontsize=9, title="Emergency contacts")
ax.grid(True, alpha=0.3)
fig.tight_layout()

out_path = os.path.join(REPO_ROOT, "paper", "figures", "sensitivity.pdf")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
fig.savefig(out_path)
print(f"Wrote {out_path}")
