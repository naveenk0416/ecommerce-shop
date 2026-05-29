## 2024-05-29 - Make hover-revealed elements keyboard accessible
**Learning:** Elements hidden by default using Tailwind's `opacity-0` and revealed on hover (`group-hover:opacity-100`) are invisible to keyboard users. When they contain interactive elements (like edit or copy buttons), this creates a significant accessibility barrier.
**Action:** Always pair `group-hover:opacity-100` and similar hover utilities with their focus equivalents (`focus:opacity-100` or `group-focus-within:opacity-100`) to ensure interactive elements are visible when tabbed to via keyboard navigation.
