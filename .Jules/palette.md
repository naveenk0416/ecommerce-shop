## 2024-07-05 - Keyboard Accessibility on Hover-revealed Buttons
**Learning:** Buttons relying on `opacity-0 group-hover:opacity-100` are invisible to keyboard users when focused, hiding critical actions like Edit/Delete.
**Action:** Always append `focus-visible:opacity-100` (or `focus-within:opacity-100` on the container) when using Tailwind's hover-based visibility classes.
