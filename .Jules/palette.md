## 2026-06-13 - Focus Accessibility for Hover-revealed Elements

**Learning:** When using Tailwind CSS `group-hover` classes to reveal elements (like action buttons in a table), they remain inaccessible to keyboard navigators because hovering is impossible without a mouse. Tabbing into these elements either doesn't make them visible or they appear abruptly.

**Action:** Always pair `group-hover` utility classes with `group-focus-within` (e.g., `group-hover:opacity-100 group-focus-within:opacity-100`) to ensure hidden interactive elements become visible and usable when receiving keyboard focus.
