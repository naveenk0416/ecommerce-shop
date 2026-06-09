## 2026-06-09 - Accessible Hover-Revealed Buttons
**Learning:** Icon-only buttons with Tailwind hover-revealed patterns (`opacity-0 group-hover:opacity-100`) become inaccessible via keyboard tab navigation because they remain invisible. Additionally, screen readers attempt to parse raw icon names if the inner icon isn't hidden.
**Action:** Always pair `group-hover:opacity-100` with focus-aware utility classes like `focus-visible:opacity-100`. Add descriptive `aria-label` and `title` attributes to the button and set `aria-hidden="true"` on the inner `<ion-icon>` tags.
