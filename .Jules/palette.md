## 2025-02-18 - Ionic Icon Accessibility in Icon-Only Buttons
**Learning:** Ionic `<ion-icon>` elements in this project can be parsed natively by screen readers, leading to redundant or confusing announcements when placed inside buttons that already have `aria-label`s.
**Action:** Always add `aria-hidden="true"` directly to the inner `<ion-icon>` when it serves a purely decorative purpose or is part of an icon-only button that has its own `aria-label` and `title`.
