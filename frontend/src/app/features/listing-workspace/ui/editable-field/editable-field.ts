import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

type SaveStatus = 'idle' | 'saving' | 'saved';

const AUTOSAVE_DEBOUNCE_MS = 500;
const SAVED_BADGE_DURATION_MS = 2000;
const COPIED_BADGE_DURATION_MS = 1500;

@Component({
  selector: 'app-editable-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
  templateUrl: './editable-field.html',
  styleUrl: './editable-field.scss',
})
export class EditableField {
  label = input.required<string>();
  placeholder = input('');
  multiline = input(false);
  maxLength = input(200);
  suggestions = input<string[]>([]);
  /** Unique key used to persist auto-saved edits to localStorage (mock persistence, no API). */
  storageKey = input('');

  value = model('');

  editing = signal(false);
  draft = signal('');
  saveStatus = signal<SaveStatus>('idle');
  copied = signal(false);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private hydrated = false;
  private suggestionIndex = -1;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private statusTimer?: ReturnType<typeof setTimeout>;
  private copyTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const key = this.storageKey();
      if (!key || this.hydrated || !this.isBrowser) return;
      this.hydrated = true;
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        this.value.set(stored);
      }
    });
  }

  startEdit(): void {
    this.draft.set(this.value());
    this.editing.set(true);
  }

  onDraftChange(next: string): void {
    this.draft.set(next);
    this.commit(next);
  }

  done(): void {
    this.editing.set(false);
  }

  cancel(): void {
    this.draft.set(this.value());
    this.editing.set(false);
  }

  regenerate(): void {
    const options = this.suggestions();
    if (!options.length) return;
    this.suggestionIndex = (this.suggestionIndex + 1) % options.length;
    const next = options[this.suggestionIndex];
    this.draft.set(next);
    this.commit(next);
  }

  async copy(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      await navigator.clipboard.writeText(this.value());
    } catch {
      return;
    }
    this.copied.set(true);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), COPIED_BADGE_DURATION_MS);
  }

  private commit(next: string): void {
    this.value.set(next);
    this.saveStatus.set('saving');

    if (this.isBrowser && this.storageKey()) {
      localStorage.setItem(this.storageKey(), next);
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveStatus.set('saved');
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => this.saveStatus.set('idle'), SAVED_BADGE_DURATION_MS);
    }, AUTOSAVE_DEBOUNCE_MS);
  }
}
