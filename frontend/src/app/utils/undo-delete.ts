import { MatSnackBar } from '@angular/material/snack-bar';

/** Deletes waiting out their Undo window — sent straight away if the tab is closed meanwhile. */
const pending = new Set<() => void>();
let flushOnPageHide = false;

export interface UndoableDelete {
  /** "Listing deleted." */
  message: string;
  undoLabel?: string;
  /** Removes the item on the server; runs once the Undo window has passed. */
  commit: () => Promise<unknown>;
  /** Puts the item back on screen (Undo clicked, or the server refused the delete). */
  restore: () => void;
  onError?: (error: unknown) => void;
  durationMs?: number;
}

/**
 * The item is already hidden on screen by the caller; the real delete waits until the snackbar
 * goes away without "Undo" being pressed (5 seconds, or earlier when another message replaces it).
 */
export function deleteWithUndo(snackBar: MatSnackBar, options: UndoableDelete): void {
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    pending.delete(commit);
    options.commit().catch((error) => {
      options.restore();
      options.onError?.(error);
    });
  };
  pending.add(commit);
  if (!flushOnPageHide && typeof window !== 'undefined') {
    flushOnPageHide = true;
    window.addEventListener('pagehide', () => [...pending].forEach((run) => run()));
  }

  const ref = snackBar.open(options.message, options.undoLabel ?? 'Undo', { duration: options.durationMs ?? 5000 });
  ref.onAction().subscribe(() => {
    if (settled) return;
    settled = true;
    pending.delete(commit);
    options.restore();
  });
  ref.afterDismissed().subscribe(({ dismissedByAction }) => {
    if (!dismissedByAction) commit();
  });
}
