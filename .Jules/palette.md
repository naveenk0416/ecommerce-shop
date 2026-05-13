## 2024-05-24 - ARIA labels for icon-only buttons
**Learning:** Found multiple instances of icon-only buttons missing ARIA labels across the application, which impacts accessibility for screen readers. Some buttons had title attributes or aria-labels, but most were missing both, and inner ion-icons were not marked as aria-hidden.
**Action:** Add aria-label and/or title attributes to all icon-only buttons (.btn-icon-premium, .btn-icon-dark) and set aria-hidden="true" on their inner <ion-icon> elements so screen readers skip the redundant icon.
