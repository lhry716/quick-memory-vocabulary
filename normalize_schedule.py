import json
import re
from datetime import datetime, timedelta
from pathlib import Path

src = Path('/Users/lhry716/Downloads/快速記憶法備份 6.json')
dst = Path('/Users/lhry716/Documents/快速記憶法/快速記憶法備份 6_一天一Unit_整理版.json')

with src.open(encoding='utf-8') as f:
    data = json.load(f)

LOCAL = datetime(2026, 9, 29)
unit_dates = {
    f'import-unit-{n}': LOCAL - timedelta(days=9-n)
    for n in range(1, 9)
}
unit_dates.update({
    'msnfyqqt-lsuyfo2': LOCAL - timedelta(days=8),
    'msocc9zp-8l5ugdl': LOCAL - timedelta(days=7),
    'msocc9zp-tgoyqsr': LOCAL - timedelta(days=6),
})

def unit_from_text(text):
    if not isinstance(text, str):
        return None
    m = re.search(r'(?:import-unit-|import-u|unit-)([1-8])', text)
    if m:
        return f'import-unit-{m.group(1)}'
    if text.startswith('msnfyqqt-'):
        return 'msnfyqqt-lsuyfo2'
    if text.startswith('msocc9zp-8'):
        return 'msocc9zp-8l5ugdl'
    if text.startswith('msocc9zp-t') or text.startswith('msod2dz7-'):
        return 'msocc9zp-tgoyqsr'
    return None

group_to_unit = {}
for group in data.get('studyGroups', []):
    if isinstance(group, dict) and group.get('id') and group.get('unitId'):
        group_to_unit[group['id']] = group['unitId']

def infer_unit(obj, inherited=None):
    if not isinstance(obj, dict):
        return inherited
    for key in ('unitId', 'sourceUnitId'):
        if isinstance(obj.get(key), str):
            u = obj[key]
            if u in unit_dates:
                return u
            inferred = unit_from_text(u)
            if inferred:
                return inferred
    for key in ('groupId', 'sourceLearningSessionId', 'id'):
        value = obj.get(key)
        if isinstance(value, str):
            if value in group_to_unit:
                return group_to_unit[value]
            inferred = unit_from_text(value)
            if inferred:
                return inferred
    return inherited

def local_dt(ms):
    return datetime.fromtimestamp(float(ms) / 1000)

def shift_value(ms, target_date):
    if not isinstance(ms, (int, float)) or ms < 100000000000:
        return ms
    old = local_dt(ms)
    new = target_date.replace(hour=old.hour, minute=old.minute,
                              second=old.second, microsecond=old.microsecond)
    return new.timestamp() * 1000

TIME_KEYS = {
    'at', 'createdAt', 'updatedAt', 'startedAt', 'completedAt', 'lastCompletedAt',
    'lastScoredAt', 'lastTestAt', 'nextDueAt', 'reviewAnchorAt', 'sourceCompletedAt'
}

def transform(obj, inherited_unit=None, forced_delta=None):
    unit = infer_unit(obj, inherited_unit) if isinstance(obj, dict) else inherited_unit
    target = unit_dates.get(unit) if unit else None
    # For nested response/round objects, preserve their parent event's exact offset.
    if forced_delta is None and target and isinstance(obj, dict):
        anchor = next((obj[k] for k in ('completedAt', 'startedAt', 'at')
                       if isinstance(obj.get(k), (int, float))), None)
        if anchor is not None:
            old = local_dt(anchor)
            new = target.replace(hour=old.hour, minute=old.minute,
                                 second=old.second, microsecond=old.microsecond)
            forced_delta = new.timestamp() * 1000 - float(anchor)
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(v, (int, float)) and (k in TIME_KEYS or k.endswith('At')):
                if forced_delta is not None and v >= 100000000000:
                    out[k] = v + forced_delta
                elif target:
                    out[k] = shift_value(v, target)
                else:
                    out[k] = v
            else:
                child_delta = forced_delta if k in {'responses', 'rounds'} else None
                out[k] = transform(v, unit, child_delta)
        return out
    if isinstance(obj, list):
        return [transform(v, inherited_unit, forced_delta) for v in obj]
    return obj

data = transform(data)
# Schedule entries use their unit/group identifier as the dictionary key rather
# than carrying a unitId field, so normalize those timestamps explicitly.
for key, schedule in data.get('groupReviewSchedules', {}).items():
    unit = unit_from_text(key)
    if not unit or unit not in unit_dates or not isinstance(schedule, dict):
        continue
    anchor = schedule.get('reviewAnchorAt')
    if not isinstance(anchor, (int, float)):
        continue
    old = local_dt(anchor)
    target = unit_dates[unit].replace(hour=old.hour, minute=old.minute,
                                      second=old.second, microsecond=old.microsecond)
    delta = target.timestamp() * 1000 - anchor
    for field in ('reviewAnchorAt', 'nextDueAt', 'lastCompletedAt'):
        if isinstance(schedule.get(field), (int, float)):
            schedule[field] += delta
# The export is being prepared on 2026-09-29; keep the import metadata current.
data['updatedAt'] = LOCAL.timestamp() * 1000

with dst.open('w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(dst)
