import os
import csv
existing_words = set()
worter_dir = "WÖRTER"
for f in os.listdir(worter_dir):
    if f.endswith(".csv"):
        path = os.path.join(worter_dir, f)
        with open(path, "r", encoding="utf-8") as csvfile:
            reader = csv.reader(csvfile, delimiter=';')
            for row in reader:
                if row:
                    existing_words.add(row[0].strip().lower())
with open("/tmp/excludes.txt", "w", encoding="utf-8") as f:
    f.write(", ".join(sorted(existing_words)))
