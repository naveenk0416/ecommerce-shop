
## 2024-06-28 - Keyboard Accessibility for Hover-Revealed Actions
**Learning:** In Tailwind CSS, utilizing hover-revealed patterns like `opacity-0 group-hover:opacity-100` makes elements inaccessible to keyboard users because they remain invisible when tabbed to.
**Action:** Always pair `group-hover:opacity-100` (and translation patterns) with focus-aware classes such as `group-focus-within:opacity-100` (or `focus-within:opacity-100` on the container) so interactive elements become visible and animate properly when receiving keyboard focus.
