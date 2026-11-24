**Comparison target**

- Source visual truth: `/var/folders/8p/l4cb0vkn5pn5pjy3xsxc2m3m0000gn/T/TemporaryItems/NSIRD_screencaptureui_4RZ1RX/截圖 2026-08-14 下午3.08.39.png`
- Implementation: `http://127.0.0.1:4173/`, captured in the Codex in-app Browser during this QA pass.
- Source dimensions: 2048 × 1280 px. Implementation desktop capture: 1280 × 720 CSS px at device scale factor 1. The comparison evaluates the shared app-content composition rather than the reference's macOS window chrome.
- State: home, Unit Groups, Word Bank, Records, and interrupted Learning session. The implementation intentionally removes both the persistent left rail and contextual right panel: this single-purpose study tool has no meaningful context switch that warrants either surface.
- Responsive rules: the shell remains a single reading column; the content code has mobile breakpoints for compact spacing and controls. Desktop verification found no horizontal overflow.

**Findings**

- No actionable P0/P1/P2 mismatch remains for the requested "Codex dark mode" design-language adaptation.
- Fonts and typography: the interface uses the platform UI stack (including PingFang TC on macOS) for human-readable Traditional Chinese and the platform mono stack for technical metadata. Page titles use 24 / 32, body text 14 / 21, metadata 12 / 18, and labels 11 / 16, matching the adopted Codex-inspired scale.
- Spacing and layout rhythm: the desktop shell uses a 56 px utility bar and a calm 920 px maximum reading column. Every decision is placed beside the content it changes, avoiding a duplicate control surface.
- Colors and visual tokens: the prototype maps to a `#171717` canvas, `#1D1D1D` sidebar, `#222222` surface, low-contrast white dividers, warm white copy, and restrained semantic blue/green/amber states. The primary study action uses a single light surface, matching the reference's controlled visual emphasis.
- Image quality and assets: neither the reference nor the implementation needs product imagery, logos, or decorative illustrations; no placeholder or custom-drawn asset was substituted.
- Copy and content: Codex navigation labels were not copied into the study product. Equivalent study-oriented labels are used so that the familiar layout does not misrepresent product actions.

**Focused comparison**

- The topbar frame was compared against the supplied capture; its dark surface hierarchy, 1 px separators, restrained radii, and low-density controls were retained. The original navigation rail and the former contextual panel were removed because both duplicated the study app's existing Home and Unit controls.
- The central panel was intentionally adapted from a chat canvas into a study dashboard. The large primary action panel preserves the source's quiet focus and low visual noise rather than copying chat-specific UI.
- Progressive disclosure now lives in the content itself: Home provides the next practice, Units provide groups and records, and the card provides only its progress and answer actions.

**Primary interactions tested**

- Entering Unit 1 opens the Groups view and preserves its group actions and navigation tabs.
- The topbar Data & Backup control remains the sole entry to the existing data-management modal.
- Word Bank status now reads as one clear state: unlearned words show only 「尚未初學」; learned words show initial difficulty and next-review detail.
- Groups, Word Bank, Records, Home, and the flashcard answer surface were exercised. The primary answer controls are 44 px high and no duplicate exit action remains.
- The home screen has no horizontal overflow at the 1280 px desktop viewport.

**Data safety verification**

- `DB_NAME`, `DB_VERSION`, `STORE_NAME`, and `STATE_KEY` were not modified.
- No persistence, migration, word, group, mastery, Test, import, or export logic was changed.
- No persistence, migration, word, group, mastery, Test, import, or export logic was changed. The JavaScript changes only render a simpler frame and clearer Word Bank status; structural and color changes are in `index.html` and `styles-final.css`.

**Comparison history**

1. Applied the Codex-inspired desktop shell and dark token system.
2. Captured the rendered home screen, then tested Unit navigation and the data-management modal.
3. Checked the 390 px responsive state, removed the duplicate mobile utility control, and captured the final desktop state.
4. Replaced the static right-hand storage panel with a state-aware contextual panel; confirmed its Unit-level action and rechecked the compact group-row layout.
5. Applied the explicit Codex-inspired token pass: platform typography, 4 px spacing rhythm, 32 / 36 px controls, 6 / 8 / 12 / 16 px radii, and lower-contrast dark surfaces. Rechecked desktop and 390 px mobile rendering.
6. Removed the persistent sidebar at the user's request and rechecked the loaded Unit screen. The central study surface expands cleanly; browser console remains clear.
7. Completed a focus-and-typesetting pass: removed the duplicate inspector and Home data-management button, shortened group-row copy, made Word Bank status single-purpose, and raised the core answer controls to a 44 px target.

**Implementation checklist**

- [x] Single-column dark workbench shell with a lightweight topbar
- [x] Codex-like neutral dark surfaces, fine dividers, restrained radii, and quiet emphasis
- [x] Existing study home, Unit, Groups, Words, Records, flashcards, and modals inherit the dark system
- [x] Actions stay beside the study content they affect; no secondary context panel duplicates navigation or exit controls
- [x] Typography, spacing, radius, color, and control-size tokens match the adopted implementation spec
- [x] Desktop and mobile layouts verified
- [x] Existing data boundary preserved

final result: passed

---

## Fixed desktop workspace — 2026-09-09

Desktop now behaves as one stable application window rather than a scrolling web page.

1. **Application frame — passed.** At a 1280 × 720 viewport, the document and body both resolve to exactly 720 px high; the toolbar and page framing remain fixed.
2. **Home and Unit Groups — passed.** The Unit collection and group collection own their own vertical scroll areas beneath their fixed headers and controls.
3. **Word Bank — passed.** Its table header remains in the fixed view while the 114-word collection scrolls inside a 307 px content region (5,605 px of content); outer-document scrolling remains disabled.
4. **Study and completion — passed.** The study card and completion sheet remain centered; long completion word lists continue to scroll internally.
5. **Runtime and data — passed.** Browser console errors: none. No persistence, migration, learning, test, import, or export logic changed.

final result: passed

---

## Spatial rhythm and contrast pass — 2026-09-09

1. **Learning card — passed.** The word or meaning now uses explicit flex alignment and its geometric centre matches the card centre; its helper copy remains independently anchored.
2. **Session workspace — passed.** Session actions are grouped into one quiet control dock, while the title, context, progress, card, and answer controls retain clear breathing room within the fixed desktop canvas.
3. **Group workspace — passed.** The segmented control now has intrinsic width; column labels remain fixed while only group rows scroll inside a constrained panel. At 1280 × 720, four complete group rows remain visible and the remaining rows scroll internally.
4. **Dark contrast — passed.** A/B/C status values and secondary actions use dark-surface contrast tokens instead of pale reverse states that wash out against graphite.
5. **Runtime and data — passed.** Outer document height remains fixed to the viewport; browser console errors: none. The session was opened and saved without recording an answer.

final result: passed

---

## Desktop completion sheet — 2026-09-09

For desktop completion screens, the outer document is now locked to the viewport and the result sheet is centered. The two answer lists use independent internal scrolling, so result actions stay visible without moving the surrounding application. Mobile continues to use normal document scrolling.

final result: passed

---

## Dark graphite glass pass — 2026-09-09

The user selected a dark end state. The previous light-only refinement has been replaced by a graphite palette designed for dark use, rather than a colour-inverted light interface.

1. **Home — passed.** Graphite canvas, one frosted action well, grouped dark Unit surface, and a neutral light primary action create hierarchy without saturated blue noise.
2. **Unit groups — passed.** The segmented control uses a translucent material; all labels, state chips, rows, buttons, and progress bars remain readable against their surface.
3. **Flashcard — passed.** The card uses one slightly lifted charcoal material; the learning prompt stays at the highest contrast and the affirmative response is the only light button.
4. **Safety and runtime — passed.** The session was inspected and stored without an answer. Browser console errors: none. Desktop layout has no horizontal overflow. IndexedDB identifiers and study logic remain unchanged.

final result: passed

---

## Glass refinement — 2026-09-09

The first macOS pass was re-audited after visual feedback. The dark neutral palette flattened hierarchy and made small metadata too faint, so this revision intentionally uses a pearlescent light canvas, clear black text, white grouped lists, and a calmer blue reserved for committed actions.

1. **Home — passed.** The action well is the only broad translucent surface; metadata now meets a readable contrast level against the white grouped Unit list.
2. **Unit groups — passed.** The selected segment label and learning-state chips have explicit contrast; the group table remains a single calm surface rather than multiple stacked cards.
3. **Flashcard — passed.** The white card is the one elevated study object, with a restrained shadow, 650-weight answer text, and one clearly blue affirmative action.
4. **Interaction and data — passed.** The paused session was resumed only to inspect presentation and saved again without answering. Browser console errors: none; desktop width has no horizontal overflow.

final result: passed

---

## macOS / SwiftUI pass — 2026-09-09

This section supersedes the earlier Codex-style comparison above.

- Target: a local-first vocabulary trainer that feels native on macOS: system typography, translucent toolbar, grouped list surfaces, restrained system-blue emphasis, and automatic light/dark appearance.
- Constraint: retain every existing learning action and all local data.
- Verified Unit Groups: segmented control, grouped rows, status chips, progress, resume/start and word-detail actions all remain present.
- Verified Word Bank: header and rows form a single grouped surface with readable terms, natural Traditional Chinese typesetting, and lower-emphasis status text.
- Verified Home: the resume action is the sole saturated-blue primary action and Unit rows remain directly selectable.
- Verified Learning session: the card remains the focus, answer controls are 40 px high, and `儲存並離開` remains explicit. The session was resumed only for visual inspection, then saved back without an answer.
- Runtime: at 1280 px, `scrollWidth === clientWidth`; browser console errors: none; the computed stack resolves `-apple-system`, `SF Pro Text`, and `PingFang TC`.
- Data safety: `DB_NAME`, `DB_VERSION`, `STORE_NAME`, and `STATE_KEY` are unchanged. No persistence, migration, import/export, word, mastery, answer, or Test logic was changed.

final result: passed
