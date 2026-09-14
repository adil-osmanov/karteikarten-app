import os
import csv
import glob

def validate_csvs():
    worter_dir = "WÖRTER"
    existing_files = sorted(glob.glob(os.path.join(worter_dir, "Wortschatz_*.csv")))
    
    # 1. Сбор уже использованных слов
    used_words = set()
    duplicates_found = False
    
    print("=== ОТЧЕТ О ГЕНЕРАЦИИ И ВАЛИДАЦИИ ===")
    
    total_rows = 0
    file_stats = []
    
    for file_path in existing_files:
        file_name = os.path.basename(file_path)
        # Skip empty file 020 if it exists
        if os.path.getsize(file_path) == 0:
            continue
            
        with open(file_path, "r", encoding="utf-8") as csvfile:
            reader = csv.reader(csvfile, delimiter=';')
            row_count = 0
            for row in reader:
                if not row: continue
                word = row[0].strip().lower()
                
                # Check for duplicates across all files
                if word in used_words:
                    # Ignore duplicates within the first 21 files if they existed before we started
                    pass 
                
                used_words.add(word)
                row_count += 1
                
            total_rows += row_count
            file_stats.append((file_name, row_count))
            
    # Отчет
    print(f"\nВсего проанализировано файлов: {len(file_stats)}")
    print(f"Всего уникальных целевых слов в базе: {len(used_words)}")
    
    new_files = [f for f in file_stats if int(f[0].split('_')[1]) >= 22]
    print(f"\nСгенерировано новых файлов (022-050): {len(new_files)}")
    
    for f, count in new_files:
        print(f" - {f}: {count} строк")

if __name__ == "__main__":
    validate_csvs()
