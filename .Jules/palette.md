## 2025-05-25 - Tailwind focus-aware hover states
**Learning:** Using `opacity-0 group-hover:opacity-100` to hide and reveal interactive elements (like icon buttons inside listing cards) breaks keyboard accessibility since tab focus doesn't trigger the hover state.
**Action:** Always combine `group-hover:opacity-100` with focus-aware states like `group-focus-within:opacity-100` and `focus-within:opacity-100` (or `focus-visible:opacity-100`) to ensure hidden actions are accessible to keyboard users when navigating.
