"""
Phase 7 figure: payload byte allocation across components (V1 current vs. V3
compact), read directly from results/encoding.json (Medium Profile) -- not
hand-typed numbers, so it can't drift from the Phase 1 data.

Run via: python bench/plot_payload_layout.py  (after `npm run bench:encoding`)
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({"font.size": 8.5, "legend.fontsize": 7.5, "xtick.labelsize": 8, "ytick.labelsize": 8})

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)

with open(os.path.join(REPO_ROOT, "results", "encoding.json"), "r", encoding="utf-8") as f:
    data = json.load(f)

profile = data["profiles"]["Medium Profile"]
budget = data["meta"]["capacityBytes"]["NTAG215"]

variants = ["V1", "V3"]
labels = ["V1 (legacy)\nJWK+base64+gzip", "V3 (deployed)\ncompact binary"]

fig, ax = plt.subplots(figsize=(3.5, 2.1))

colors = {"content": "#1b6ca8", "ndef": "#c1440e", "tlv": "#8a8a8a"}
y_pos = range(len(variants))

for i, v in enumerate(variants):
    b = profile[v]
    content = b["encodedContentBytes"]
    ndef = b["ndefRecordBytes"]
    tlv = b["tlvBytes"]
    ax.barh(i, content, color=colors["content"], label="Encoded content" if i == 0 else None)
    ax.barh(i, ndef, left=content, color=colors["ndef"], label="NDEF record overhead" if i == 0 else None)
    ax.barh(i, tlv, left=content + ndef, color=colors["tlv"], label="TLV wrapper" if i == 0 else None)
    total = content + ndef + tlv
    ax.text(total + 8, i, f"{total} B", va="center", fontsize=8)

ax.axvline(budget, color="black", linewidth=1.0, linestyle=":")
ax.text(budget - 6, len(variants) - 0.45, f"NTAG215\n{budget} B", fontsize=7, va="top", ha="right")

ax.set_yticks(list(y_pos))
ax.set_yticklabels(labels, fontsize=8)
ax.set_xlabel("Bytes written to tag")
ax.legend(loc="upper center", bbox_to_anchor=(0.35, -0.38), ncol=3, frameon=False, handlelength=1.0, columnspacing=0.6, fontsize=6.5)
ax.set_xlim(0, max(budget, profile["V1"]["totalTagBytes"]) * 1.2)
ax.set_ylim(-0.6, len(variants) - 0.4)
fig.tight_layout()

out_path = os.path.join(REPO_ROOT, "paper", "figures", "payload_layout.pdf")
fig.savefig(out_path, bbox_inches="tight", pad_inches=0.02)
print(f"Wrote {out_path}")
