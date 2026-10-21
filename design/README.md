# Design

`tokens.json` is the launcher's design system token file. `scripts/tokens.mjs`
turns it into `src/lib/styles/tokens.css`, so every color, radius, size and
type style is a CSS custom property or a `.t-<style>` class. Change tokens
there, never in components, then run `pnpm tokens`.

The screens follow the graphite boards of the "Preservation Launcher" canvas:
Garage (H1), Profile (G1b), Cars (H2), Save data (H3), Edit driver (H4),
World (H5), Host (H6), Logs (H7), the log viewer (H8), Settings (H9) and the
first run (H10). The rules, which apply to every screen:

- **Graphite, not glass.** Panels are opaque `graphite` with a
  `graphite-edge` border and one drop shadow, no blur and no highlight.
  Inside a panel, `graphite-raised` fills fields, chips, empty states and the
  selected row. Every view but the Garage dims the backdrop heavily; the
  header's pills and the Profile tabs are flat graphite.
- **Two text levels per panel.** Titles (`panel-title`, 18px; a view's
  title is `view-title`, 26px), then body at 16px/1.5 and secondary text
  at 14px in `ink-soft`. No text uses the faint grey; `ink-faint` is for
  disabled controls only.
- **Sentence case** for labels, titles, buttons and navigation, with little
  letter-spacing. Only event-type tags are uppercase.
- **Say what is coming, the same way everywhere.** Anything planned but not
  usable yet stays in view, marked "Coming in a future update" in the
  `upcoming` violet with a clock icon, never colour alone: the `Upcoming`
  pill where the feature will be (a row, a panel heading), the compact clock
  on a step or tab that cannot be picked yet (the Map
  tab), and one coming note (`ViewNote`) on a view whose main content is
  not here yet or that has several upcoming items. The note says what is
  coming as a short noun phrase; what already works sits beside it. Things
  with no plan are not shown.
- **Help behind an info button** (`InfoButton`): an ⓘ with an accessible
  name and a tooltip that opens on hover and on focus, instead of a sentence
  under every control.
- **Empty states are one line** (`EmptyLine`), such as "No driving stats
  yet". Rarely used sections wait behind a "Show more" row (`ShowMore`):
  SpeedList, more log sources, raw save tables, build details.
- **Numbers** sit right-aligned with tabular figures (`t-num`, `t-big`).
  Identical cars share a row: "Volvo 242 (1975) × 4".
- **Layout:** 24px panel padding, running text kept to about 65 characters
  a line, and single columns for World, Settings and Edit driver.
- **Personal info is impossible to miss.** A source that holds it (EA
  Desktop logs, game crash dumps, protocol recordings, the save's identity)
  carries the amber `PiiBadge` with an icon and the words "Personal info",
  plus a line saying what it holds; never colour alone. Such sources are
  never folded away, start unchecked in a report, and Logs warns "Check
  before you share". "Hide my user name" (on by default) puts %USERNAME% in
  place of the Windows user name in everything the launcher copies
  (`src/lib/state/privacy.ts`).
- One accent button per screen: Play, Connect or Next, in the game logo's
  blue (`play`). The Afterhours mark keeps its own orange (`brand`).
- **Window buttons stay apart from the profile.** Minimize, Maximize (Restore
  while maximized) and Close sit at the far right of the header after a
  divider, never inside the profile pill, with the Windows glyphs, square
  hovers and a red Close (`window-close`). They share the profile's row and
  centre line, so they wrap with it at the narrowest window.
- Color means event type or status, and a status is always a word plus a dot.
- All text is DM Sans. Every target is at least 38px tall with a visible
  focus ring, so the launcher works with a gamepad.
- Voice: like a crew member texting you. Short, plain, specific. A disabled
  Play says why.

`app-icon-1024.png` is the source for the generated `src-tauri/icons`.
