# Design

`tokens.json` is the launcher's design system token file, copied verbatim
from the "Afterhours Launcher" design system. `scripts/tokens.mjs` turns it
into `src/lib/styles/tokens.css`, so every color, radius, size, blur and type
style is a CSS custom property or a `.t-<style>` class. Change tokens there,
never in components, then run `pnpm tokens`.

The screens follow the "Garage 1a: full launcher" boards of the
"Preservation Launcher" canvas. The rules that matter most, from the design
system's brand book:

- The garage backdrop is the brand. Glass for everything you navigate, with no
  borders on panels; the launch bar, the car or server name and the Play button
  sit on the floor.
- One accent button per screen: Play, Connect or Next, in the game logo's blue (`play`). Nothing else uses it. The Afterhours mark keeps its own orange (`brand`), which appears nowhere else.
- Color means event type or status, and a status is always a word plus a dot.
- Interface text is Saira Semi Condensed, data is JetBrains Mono. Short and
  structural text is uppercase with tracking; sentences are sentence case;
  addresses and paths keep their real case.
- Every target is at least 38px tall in a 44px hit area, with a visible focus
  ring, so the launcher works with a gamepad.
- Voice: like a crew member texting you. Short, plain, specific. A disabled
  Play says why.

`app-icon-1024.png` is the source for the generated `src-tauri/icons`.
