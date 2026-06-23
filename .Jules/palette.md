## 2026-06-23 - Focus Accessibility for Hover-Revealed Elements
**Learning:** A recurring pattern in the app's Tailwind implementation uses `opacity-0 group-hover:opacity-100` (and translation equivalents) to reveal action buttons on hover. This completely breaks keyboard navigation as the elements remain invisible (or off-screen) when focused via tab.
**Action:** Always pair `group-hover:opacity-100` with `focus-within:opacity-100` on parent container elements, or `focus-visible:opacity-100` directly on the focusable elements, to ensure keyboard accessibility matches mouse behavior.
