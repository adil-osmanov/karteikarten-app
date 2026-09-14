import os
import csv
import re

# 1. Read existing words
existing_words = set()
worter_dir = "WÖRTER"
for f in os.listdir(worter_dir):
    if f.endswith(".csv") and f != "Wortschatz_020_Top_1901-2000.csv": # 020 was empty
        path = os.path.join(worter_dir, f)
        with open(path, "r", encoding="utf-8") as csvfile:
            # handle semicolon
            reader = csv.reader(csvfile, delimiter=';')
            for row in reader:
                if row:
                    word = row[0].strip().lower()
                    existing_words.add(word)

print(f"Loaded {len(existing_words)} existing words.")

# 2. Read frequency list
freq_words = []
with open("/tmp/de_top_5000.txt", "r", encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split()
        if parts:
            word = parts[0].strip().lower()
            # simple filter for words (no numbers/punctuation)
            if word.isalpha() and len(word) > 1:
                freq_words.append(word)

# 3. Filter unused words
unused_words = []
for w in freq_words:
    if w not in existing_words:
        unused_words.append(w)
    if len(unused_words) >= 2900:
        break

print(f"Found {len(unused_words)} unused words.")

# 4. Save chunks for subagents
chunk_size = 100
for i in range(29):
    file_idx = i + 22
    start = i * chunk_size
    end = start + chunk_size
    chunk = unused_words[start:end]
    
    with open(f"/tmp/target_words_{file_idx}.txt", "w", encoding="utf-8") as f:
        for w in chunk:
            f.write(w + "\n")
print("Saved 29 target files to /tmp/")
