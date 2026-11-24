# Remember 2027 — Safe UI/UX Implementation Brief

You are improving the UI and UX of an existing local-first vocabulary study website. Work as a product designer and frontend engineer. Improve layout, information hierarchy, typography, whitespace, responsive behavior, and interaction feedback without affecting any saved study data.

## Non-negotiable data safety rules

The application saves all Units, vocabulary, fixed 20-word groups, initial A/B/C ratings, mastery, test records, and paused sessions in IndexedDB.

Do not:

- Delete, clear, reinitialize, migrate, or overwrite existing IndexedDB data.
- Change the meaning or value of these constants:

  ```js
  DB_NAME = "remember-2027"
  DB_VERSION = 1
  STORE_NAME = "app-state"
  STATE_KEY = "current"
  ```

- Use `indexedDB.deleteDatabase`, `localStorage.clear`, `sessionStorage.clear`, or code that overwrites saved state with a blank initial state.
- Alter word `id`, `unitId`, `term`, `meaning`, `initialDifficulty`, `mastery`, initial-learning records, relearning records, test records, or existing group membership/order.
- Re-randomize the existing fixed 20-word study groups.
- Rewrite `app.js` from scratch, introduce a framework, or replace the local-first architecture.

Before editing, ask the user to export a JSON backup from the in-app **Data management** screen. Never auto-import that backup or overwrite it.

If a requested visual change truly requires a data-model change, stop and explain the trade-off before modifying anything.

## Project files

```text
index.html          Loads fonts, CSS, and the application.
app.js              Existing render functions, events, IndexedDB, and study logic.
styles.css          Legacy base styles.
styles-final.css    Loaded last; preferred place for visual overrides.
```

Work in this order:

1. Read `app.js` to understand render functions and the data boundary.
2. Make visual and responsive changes in `styles-final.css` first.
3. Edit only render markup in `app.js` when necessary for a clearer layout or accessibility. Do not change data, persistence, study, import/export, mastery, or test-convergence logic.
4. Preserve all current interaction actions and states.

## Product structure that must remain intact

### Home

- Home is above Unit level. Users should not select a Unit before seeing Home.
- It shows one appropriate next action: resume a paused session or start due review.
- It lists all Units, but users remain free to enter any Unit at any time.

### Inside each Unit

Three tabs must remain available:

1. **Groups** — fixed, pre-randomized groups of roughly 20 words. Every group is independently learnable, repeatable, testable, and viewable.
2. **Words** — all words in the Unit, Chinese meaning, initial rating, and current mastery state.
3. **Records** — saved Test results.

### Learning behavior

- A group is learned first, then tested as the same group.
- A Test starts with the full group and repeats only missed words until convergence.
- A/B/C are the original initial-learning baseline and must never be overwritten.
- Relearning may create a separate record, but cannot overwrite the original A/B/C baseline.
- Refreshing the page must preserve everything.

## Design direction

Create a calm, mature, highly readable study tool — not a gamified dashboard.

- Light canvas, premium neutral grays, and only restrained low-saturation status colors.
- Use clear reading order and precise whitespace. Do not put every section inside a floating white card.
- Use `Noto Sans TC` for Chinese UI, a clean sans-serif for English terms, and optionally `IBM Plex Mono` for metrics and dates.
- Do not use high-contrast serif type for word-list rows or flashcard body text.
- Use cards only for genuine focus areas, such as a flashcard or the single current action. Prefer dividers and grid alignment for lists.
- Keep corner radii, shadows, icons, button hierarchy, focus states, and hover behavior consistent.
- Keep a single primary entrance for any primary action; secondary actions should be subdued text buttons.
- Support desktop and narrow mobile widths without horizontal overflow.

## Issues to solve

### Home

- The current action should be clearly dominant, while Units remain a calm scannable list.
- Do not make every Unit a large floating card with equal visual weight.

### Unit / Groups

- Avoid stacking a card header, a tab shell, and a separate current-session card before the groups.
- Group rows should make group name, initial-learning progress, initial record/Test state, and the primary action easy to compare.
- Do not repeat generic text such as “20 words” or “learn first, then test” in every group.
- Keep “view this group’s words” available as a secondary action.

### Words

- Keep the summary compact; do not show a large panel of many tiny status chips.
- Use named list columns: English, Chinese, Status.
- Keep each row’s status concise and non-redundant.

### Flashcards

- The flashcard is the only focal surface. Avoid oversized blank containers and competing visual focal points.
- Long English phrases must wrap naturally and reduce in scale as needed.
- Chinese answers need comfortable line length and leading.
- “Know” and “Don’t know” are one answer choice; make their relationship visually clear without making them look like unrelated CTAs.

## Constraints

- No React, Vue, Tailwind, backend, login, cloud sync, or replacement database.
- Do not add book photos to the product UI.
- Use Traditional Chinese for user-facing text.
- You may add semantic HTML and accessible labels, but keep existing `data-action` wiring working.

## Acceptance checklist

- [ ] Opening `index.html` still shows all existing Units, vocabulary, progress, and records.
- [ ] Refreshing does not remove data.
- [ ] IndexedDB constants and schema behavior are unchanged.
- [ ] JavaScript syntax check passes.
- [ ] Home, Groups, Words, Records, and Flashcards work on desktop and mobile widths without overlap or horizontal overflow.
- [ ] Home has one obvious next action, while Units remain freely selectable.
- [ ] Every group still allows learning, repeated testing, and viewing its words.
- [ ] Keyboard focus is visible for interactive controls.

## Required handoff

When finished, report:

1. Every file changed.
2. Which changes are visual-only.
3. How existing data safety was verified.
4. Any design decision that needs user approval.

The user will provide specific UI references and visual direction after this brief. Treat the safety rules and existing learning logic above as the highest priority.
