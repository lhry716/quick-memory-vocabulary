#!/usr/bin/env python3
"""Create a review list and a backup excluding clearly pasted sentences."""

import json
from pathlib import Path

SOURCE = Path("/Users/lhry716/Downloads/快速記憶法備份 2.json")
OUTPUT = Path("快速記憶法備份 2_已篩除完整句子.json")
REPORT = Path("晟景_句子篩選報告.json")

# These are complete declarative/interrogative-style sentences, rather than
# standalone vocabulary or a reusable phrase. IDs are safer than matching text.
CLEAR_SENTENCE_IDS = {
    "shengjing-t1-r1-w029",  # she got to know the kids there, too
    "shengjing-t2-r4-w019",  # I still recall my best playmate
    "shengjing-t2-r4-w022",  # Little did we know
}

# Source fragments/clauses to exclude as requested.
FRAGMENT_IDS = {
    "shengjing-t1-r1-w027",  # As she was
    "shengjing-t2-r1-w024",  # As he sat
    "shengjing-t2-r3-w002",  # only to end up finding yourself ...
    "shengjing-t2-r3-w048",  # tuning in to see what many considered ...
}

data = json.loads(SOURCE.read_text(encoding="utf-8"))
words_by_id = {word["id"]: word for word in data["words"]}

excluded_ids = CLEAR_SENTENCE_IDS | FRAGMENT_IDS
removed = [words_by_id[word_id] for word_id in sorted(CLEAR_SENTENCE_IDS)]
fragments = [words_by_id[word_id] for word_id in sorted(FRAGMENT_IDS)]

data["words"] = [word for word in data["words"] if word["id"] not in excluded_ids]
OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

report = {
    "source": str(SOURCE),
    "action": "已從匯入備份移除完整句子、子句與長片段。",
    "removedCompleteSentences": [
        {"id": word["id"], "unitId": word["unitId"], "term": word["term"]}
        for word in removed
    ],
    "removedFragments": [
        {"id": word["id"], "unitId": word["unitId"], "term": word["term"]}
        for word in fragments
    ],
}
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
