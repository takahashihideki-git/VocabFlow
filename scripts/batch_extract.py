import json, os

def load_words(filepath='../1900_words_list.md'):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    words = []
    for line in lines:
        word = line.strip()
        if word and not word.startswith('#'):
            words.append(word)
    assert len(words) == 1900, f"Expected 1900 words, got {len(words)}"
    return words

def create_batches(words, batch_size=20):
    batches = []
    for i in range(0, len(words), batch_size):
        batch = []
        for j, word in enumerate(words[i:i+batch_size]):
            batch.append({'id': i + j + 1, 'word': word})
        batches.append(batch)
    return batches

def save_batch(batch, batch_num, output_dir='batches'):
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, f'batch_{batch_num:03d}.json')
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(batch, f, ensure_ascii=False, indent=2)
    return filepath

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    words = load_words()
    batches = create_batches(words)
    print(f"Total batches: {len(batches)}")
    for i, batch in enumerate(batches):
        path = save_batch(batch, i + 1)
        print(f"Batch {i+1:3d}: words {batch[0]['id']:4d}-{batch[-1]['id']:4d} -> {path}")
