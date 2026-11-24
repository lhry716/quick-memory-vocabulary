#!/usr/bin/env python3
"""Rebuild the Advanced English course through the Oct 19 Unit 21 boundary."""

from __future__ import annotations

import copy
import json
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "快速記憶法_iOS整理版_20261018.json"
OUTPUT = ROOT / "快速記憶法_iOS整理版_每日複習重建_20261019.json"
TZ = ZoneInfo("Asia/Taipei")
FIRST_DAY = date(2026, 9, 29)
LAST_STUDY_DAY = date(2026, 10, 18)
COMPLETION_DATE = date(2026, 10, 19)  # before the 05:00 study-day boundary
NEXT_STUDY_DAY = LAST_STUDY_DAY + timedelta(days=1)
INTERVALS = [1, 3, 7, 14, 30, 30, 30]
LABELS = ["D1", "D3", "D7", "D14", "D30", "D30", "D30"]


def stamp(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def dt_from_ms(value: object) -> datetime | None:
    if isinstance(value, (int, float)) and value > 100_000_000_000:
        return datetime.fromtimestamp(value / 1000, TZ)
    return None


def shift_mastery_one_day(mastery: dict) -> dict:
    """Move saved Recovery timestamps with the reconstructed timeline."""
    shifted = copy.deepcopy(mastery)
    for key in ("lastScoredAt", "lastTestAt", "nextDueAt", "reviewAnchorAt"):
        old = dt_from_ms(shifted.get(key))
        if old is not None:
            shifted[key] = stamp(old + timedelta(days=1))
    day_key = shifted.get("lastScoredDay")
    if isinstance(day_key, str):
        try:
            shifted["lastScoredDay"] = (date.fromisoformat(day_key) + timedelta(days=1)).isoformat()
        except ValueError:
            pass
    return shifted


def shift_to_day(value: object, target_day: date) -> object:
    old = dt_from_ms(value)
    if old is None:
        return value
    return stamp(datetime.combine(target_day, old.timetz().replace(tzinfo=None), TZ))


def shift_nested_times(obj: object, target_day: date) -> object:
    if isinstance(obj, list):
        return [shift_nested_times(item, target_day) for item in obj]
    if not isinstance(obj, dict):
        return obj
    result = {}
    for key, value in obj.items():
        if key == "at" or key.endswith("At"):
            result[key] = shift_to_day(value, target_day)
        else:
            result[key] = shift_nested_times(value, target_day)
    return result


def study_start(day: date) -> datetime:
    return datetime.combine(day, time(5, 0), TZ)


def due_day(anchor_day: date, interval: int) -> date:
    return anchor_day + timedelta(days=interval)


def recovery_word(word: dict) -> bool:
    mastery = word.get("mastery") or {}
    return mastery.get("needsRecovery") is True or mastery.get("isRecoveryConfirmation") is True


def set_status(mastery: dict, stage: int, needs: bool, confirming: bool) -> None:
    if needs:
        mastery["status"] = "需加強"
    elif confirming:
        mastery["status"] = "確認中"
    elif stage == 1:
        mastery["status"] = "已初學"
    elif stage <= 4:
        mastery["status"] = "學習中"
    else:
        mastery["status"] = "熟悉"


def make_review_record(unit: dict, group: dict, word_ids: list[str], stage: int, due_day: date) -> dict:
    label = LABELS[stage - 1]
    event_day = COMPLETION_DATE if due_day == LAST_STUDY_DAY else due_day
    start_time = time(0, 0) if due_day == LAST_STUDY_DAY else time(18, 30)
    start = datetime.combine(event_day, start_time, TZ) + timedelta(minutes=(group["groupNumber"] - 1) * 2)
    responses = [
        {"at": stamp(start + timedelta(seconds=i * 2)), "known": True, "round": 1, "wordId": word_id}
        for i, word_id in enumerate(word_ids)
    ]
    completed = start + timedelta(seconds=max(5, len(responses) * 2))
    scope_label = f"第 {group['groupNumber']} 組 · {label} 複習"
    if due_day == LAST_STUDY_DAY:
        scope_label = f"第 {group['groupNumber']} 組今日到期複習 · {label} 複習"
    return {
        "id": f"rebuilt-review-{group['id']}-d{label.lower()}-{due_day.isoformat()}",
        "unitId": unit["id"],
        "groupId": group["id"],
        "groupLabel": f"第 {group['groupNumber']} 組",
        "scope": "group",
        "scopeLabel": scope_label,
        "testNumber": stage,
        "startedAt": stamp(start),
        "completedAt": stamp(completed),
        "wordIds": word_ids,
        "responses": responses,
        "rounds": [{
            "round": 1,
            "wordIds": word_ids,
            "known": len(word_ids),
            "unknown": 0,
            "completedAt": stamp(completed),
        }],
    }


def make_recovery_record(unit: dict, batch_no: int, word_ids: list[str], day: date) -> dict:
    start = datetime.combine(COMPLETION_DATE, time(2, 0), TZ) + timedelta(minutes=(batch_no - 1) * 2)
    responses = [
        {"at": stamp(start + timedelta(seconds=i * 2)), "known": False, "round": 1, "wordId": word_id}
        for i, word_id in enumerate(word_ids)
    ]
    second_round_start = start + timedelta(minutes=1)
    responses.extend(
        {"at": stamp(second_round_start + timedelta(seconds=i * 2)), "known": True, "round": 2, "wordId": word_id}
        for i, word_id in enumerate(word_ids)
    )
    completed = second_round_start + timedelta(seconds=max(5, len(word_ids) * 2))
    return {
        "id": f"rebuilt-recovery-{unit['id']}-{day.isoformat()}-{batch_no}",
        "unitId": unit["id"],
        "groupId": f"recovery-{unit['id']}-{day.isoformat()}-{batch_no}",
        "groupLabel": f"Recovery 第 {batch_no} 組",
        "scope": "unit",
        "scopeLabel": f"Recovery 第 {batch_no} 組",
        "testNumber": 1,
        "startedAt": stamp(start),
        "completedAt": stamp(completed),
        "wordIds": word_ids,
        "responses": responses,
        "rounds": [
            {"round": 1, "wordIds": word_ids, "known": 0, "unknown": len(word_ids), "completedAt": stamp(start + timedelta(seconds=max(5, len(word_ids) * 2)))},
            {"round": 2, "wordIds": word_ids, "known": len(word_ids), "unknown": 0, "completedAt": stamp(completed)},
        ],
    }


def main() -> None:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    units = [u for u in data["units"] if u.get("bookId") == "ios-default-book"][:20]
    assert len(units) == 20
    unit_by_id = {u["id"]: u for u in units}
    unit_day = {u["id"]: FIRST_DAY + timedelta(days=i) for i, u in enumerate(units)}
    words_by_id = {w["id"]: w for w in data["words"]}
    groups_by_unit: dict[str, list[dict]] = defaultdict(list)
    for group in data["studyGroups"]:
        if group.get("unitId") in unit_by_id:
            groups_by_unit[group["unitId"]].append(group)
    for groups in groups_by_unit.values():
        groups.sort(key=lambda g: g.get("groupNumber", 0))

    # Preserve the current Recovery set before rebuilding schedule state.
    recovery_ids_by_unit: dict[str, list[str]] = defaultdict(list)
    recovery_due_ids_by_unit: dict[str, list[str]] = defaultdict(list)
    old_mastery_by_id = {}
    today_cutoff = stamp(datetime.combine(COMPLETION_DATE, time(4, 59, 59), TZ))
    for word in data["words"]:
        if word.get("unitId") not in unit_by_id:
            continue
        old = copy.deepcopy(word.get("mastery") or {})
        if recovery_word(word):
            old = shift_mastery_one_day(old)
        old_mastery_by_id[word["id"]] = old
        if recovery_word(word):
            recovery_ids_by_unit[word["unitId"]].append(word["id"])
            due_at = old.get("nextDueAt")
            if isinstance(due_at, (int, float)) and due_at <= today_cutoff:
                recovery_due_ids_by_unit[word["unitId"]].append(word["id"])

    # Move initial-learning sessions and per-word first-learning responses onto
    # the consecutive day assigned to each unit.
    for session in data.get("learningSessions", []):
        unit_id = session.get("unitId")
        if unit_id in unit_day:
            session.update(shift_nested_times(session, unit_day[unit_id]))
    for word in data["words"]:
        unit_id = word.get("unitId")
        if unit_id in unit_day:
            learning = word.get("initialLearning")
            if isinstance(learning, dict):
                word["initialLearning"] = shift_nested_times(learning, unit_day[unit_id])

    # Rebuild records due through the Oct 18 study day; those final-day
    # sessions are timestamped before the Oct 19 05:00 boundary.
    advanced_tests = []
    other_tests = []
    for test in data.get("tests", []):
        if test.get("unitId") in unit_by_id:
            # Existing active Recovery history is retained and placed on the
            # rebuilt day's Recovery stream; normal records are regenerated.
            if str(test.get("scopeLabel", "")).startswith("Recovery 第"):
                unit_id = test["unitId"]
                recovery_day = unit_day[unit_id] + timedelta(days=1)
                test = shift_nested_times(test, recovery_day)
                match = re.search(r"Recovery 第 (\d+) 組", str(test.get("scopeLabel", "")))
                if match:
                    test["groupId"] = f"recovery-{unit_id}-{recovery_day.isoformat()}-{match.group(1)}"
                other_tests.append(test)
        else:
            other_tests.append(test)

    for unit_index, unit in enumerate(units):
        learned_day = unit_day[unit["id"]]
        anchor = study_start(learned_day)
        for group in groups_by_unit[unit["id"]]:
            group_id = group["id"]
            group_words = [words_by_id[word_id] for word_id in group.get("wordIds", []) if word_id in words_by_id]
            group_recovery_ids = {w["id"] for w in group_words if w["id"] in recovery_ids_by_unit[unit["id"]]}

            completed_stages = 0
            for stage, interval in enumerate(INTERVALS, start=1):
                day = due_day(learned_day, interval)
                if day > LAST_STUDY_DAY:
                    break
                completed_stages = stage
                word_ids = [w["id"] for w in group_words if w["id"] not in group_recovery_ids]
                advanced_tests.append(make_review_record(unit, group, word_ids, stage, day))

            next_stage = min(7, completed_stages + 1)
            next_day = due_day(learned_day, INTERVALS[next_stage - 1])
            group_schedule = {
                "hasPassedFinalReview": False,
                "modelVersion": 9,
                "nextDueAt": stamp(study_start(next_day)),
                "reviewAnchorAt": stamp(anchor),
                "stage": next_stage,
            }
            data["groupReviewSchedules"][group_id] = group_schedule

            last_done = due_day(learned_day, INTERVALS[completed_stages - 1]) if completed_stages else None
            last_test_at = None
            if last_done:
                last_test_at = datetime.combine(
                    COMPLETION_DATE if last_done == LAST_STUDY_DAY else last_done,
                    time(1, 15) if last_done == LAST_STUDY_DAY else time(18, 45),
                    TZ,
                )
            for word in group_words:
                mastery = word.setdefault("mastery", {})
                old = old_mastery_by_id.get(word["id"], {})
                if word["id"] in group_recovery_ids:
                    due_at = old.get("nextDueAt")
                    if not isinstance(due_at, (int, float)) or due_at > today_cutoff:
                        word["mastery"] = copy.deepcopy(old)
                        continue

                    # The app scores a formal Recovery on round one. Reconstruct
                    # the requested result: every word misses round one and is
                    # answered correctly on round two, so it remains in Recovery.
                    completed_at = datetime.combine(COMPLETION_DATE, time(4, 0), TZ)
                    old_stage = max(1, min(7, int(old.get("stage") or 1)))
                    mastery = copy.deepcopy(old)
                    mastery.update({
                        "modelVersion": 7,
                        "needsRecovery": True,
                        "isRecoveryConfirmation": False,
                        "recoveryTargetStage": int(old.get("recoveryTargetStage") or old_stage),
                        "nextDueAt": stamp(study_start(NEXT_STUDY_DAY)),
                        "lastTestAt": stamp(completed_at),
                        "lastScoredAt": stamp(completed_at),
                        "lastScoredDay": LAST_STUDY_DAY.isoformat(),
                        "lastTestCorrect": False,
                        "tests": int(old.get("tests") or 0) + 1,
                    })
                    set_status(mastery, old_stage, True, False)
                    word["mastery"] = mastery
                    continue
                mastery.update({
                    "modelVersion": 7,
                    "reviewAnchorAt": stamp(anchor),
                    "stage": next_stage,
                    "nextDueAt": stamp(study_start(next_day)),
                    "qualifiedCount": max(0, completed_stages),
                    "tests": max(0, completed_stages),
                    "hasPassedFinalReview": False,
                })
                mastery.update({
                    "needsRecovery": False,
                    "isRecoveryConfirmation": False,
                    "recoveryTargetStage": None,
                    "lastTestAt": stamp(last_test_at) if last_test_at else None,
                    "lastScoredAt": stamp(last_test_at) if last_test_at else None,
                    "lastScoredDay": last_done.isoformat() if last_done else None,
                    "lastTestCorrect": True if last_done else None,
                })
                set_status(mastery, next_stage, False, False)

        # Rebuild today's Recovery cards from every current active Recovery word.
        recovery_words = [words_by_id[word_id] for word_id in recovery_due_ids_by_unit[unit["id"]]]
        recovery_words.sort(key=lambda w: str(w.get("term", "")).casefold())
        for start in range(0, len(recovery_words), 20):
            batch = recovery_words[start:start + 20]
            advanced_tests.append(make_recovery_record(unit, start // 20 + 1, [w["id"] for w in batch], LAST_STUDY_DAY))

    data["tests"] = sorted(other_tests + advanced_tests, key=lambda t: t.get("completedAt", 0), reverse=True)
    # Current Recovery flags and due dates remain intact; records keep the full
    # Recovery set visible in the reconstructed final day.
    data["updatedAt"] = stamp(datetime.combine(COMPLETION_DATE, time(4, 59), TZ))
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    # Concise verification report.
    review_count = sum(1 for t in advanced_tests if t.get("scope") == "group")
    recovery_count = sum(1 for t in advanced_tests if str(t.get("scopeLabel", "")).startswith("Recovery 第"))
    print(f"Wrote {OUTPUT}")
    print(f"Advanced course: {len(units)} completed units; Day 1 {FIRST_DAY}; Unit 20 {LAST_STUDY_DAY}; Unit 21 starts {study_start(NEXT_STUDY_DAY)}")
    print(f"Generated formal group-review records: {review_count}")
    print(f"Recovery words completed before the Oct 19 05:00 boundary: {sum(len(t['wordIds']) for t in advanced_tests if str(t.get('scopeLabel', '')).startswith('Recovery 第') and t.get('unitId') in unit_by_id)}")
    print(f"Recovery review batches: {recovery_count}")
    print(f"Current recovery IDs preserved in today's records: {sum(len(v) for v in recovery_ids_by_unit.values())}")


if __name__ == "__main__":
    main()
