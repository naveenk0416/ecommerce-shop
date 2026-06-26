## 2025-02-24 - Accessible Hover Actions
**Learning:** Elements hidden with `opacity-0` and revealed on `group-hover` (`group-hover:opacity-100`) are invisible to keyboard users who navigate via <kbd>Tab</kbd>.
**Action:** Always pair `group-hover:opacity-100` and `group-hover:translate-x-0` with `focus-within:opacity-100` and `focus-within:translate-x-0` (or similar focus states) so the actions become visible when inner buttons receive keyboard focus.
