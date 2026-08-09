import { ChangeDetectionStrategy, Component, input, model, output, signal } from '@angular/core';
import { IonInput, IonLabel } from '@ionic/angular/standalone';

@Component({
  selector: 'app-password-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonLabel, IonInput],
  templateUrl: './password-field.html',
  styleUrl: './password-field.scss',
})
export class PasswordField {
  label = input.required<string>();
  placeholder = input('••••••••');
  autocomplete = input<'current-password' | 'new-password'>('current-password');

  value = model('');
  /** Emits on Enter, so the last field in a form can submit it. */
  enter = output<void>();

  /** Hidden by default, per the show/hide password spec. */
  visible = signal(false);

  toggleVisibility(): void {
    this.visible.update((v) => !v);
  }
}
