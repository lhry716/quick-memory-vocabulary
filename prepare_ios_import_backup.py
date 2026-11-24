#!/usr/bin/env python3
"""Create a compact iOS-importable copy without changing learning progress.

This keeps the app's v11 schema and every content, schedule, recovery,
session, and history record. Only iOS-irrelevant page metadata is removed.
The source is read-only and is never overwritten.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


IOS_UNUSED_TOP_LEVEL_FIELDS = {"ui", "lastCompletion", "createdAt", "updatedAt"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    state = json.loads(args.source.read_text(encoding="utf-8"))
    required_arrays = ("books", "units", "words", "studyGroups", "tests")
    if not isinstance(state, dict) or any(not isinstance(state.get(key), list) for key in required_arrays):
        raise SystemExit("來源不是有效的 QuickMemory 備份；沒有產生輸出檔。")
    if state.get("version") != 11:
        raise SystemExit(f"預期 App v11 備份，來源版本為 {state.get('version')}；沒有產生輸出檔。")

    removed = {key: state.pop(key) for key in IOS_UNUSED_TOP_LEVEL_FIELDS if key in state}
    args.output.write_text(
        json.dumps(state, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    # Guard against accidental edits to the actual learning payload.
    exported = json.loads(args.output.read_text(encoding="utf-8"))
    original = json.loads(args.source.read_text(encoding="utf-8"))
    for key in IOS_UNUSED_TOP_LEVEL_FIELDS:
        original.pop(key, None)
    if exported != original:
        args.output.unlink(missing_ok=True)
        raise SystemExit("輸出校驗失敗，已移除不完整輸出檔。")

    print(json.dumps({
        "output": str(args.output),
        "version": exported["version"],
        "removedTopLevelFields": sorted(removed),
        "books": len(exported["books"]),
        "units": len(exported["units"]),
        "words": len(exported["words"]),
        "studyGroups": len(exported["studyGroups"]),
        "groupReviewSchedules": len(exported.get("groupReviewSchedules", {})),
        "learningSessions": len(exported.get("learningSessions", [])),
        "tests": len(exported.get("tests", [])),
        "pausedSessions": len(exported.get("pausedSessions", [])),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
