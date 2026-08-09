import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Rule {
  label: string;
  met: boolean;
}

const LEVELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'] as const;

@Component({
  selector: 'app-password-strength',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './password-strength.html',
  styleUrl: './password-strength.scss',
})
export class PasswordStrength {
  password = input.required<string>();

  rules = computed<Rule[]>(() => {
    const value = this.password();
    return [
      { label: 'At least 8 characters', met: value.length >= 8 },
      { label: 'One uppercase letter', met: /[A-Z]/.test(value) },
      { label: 'One lowercase letter', met: /[a-z]/.test(value) },
      { label: 'One number', met: /[0-9]/.test(value) },
      { label: 'One special character', met: /[^A-Za-z0-9]/.test(value) },
    ];
  });

  score = computed(() => this.rules().filter((r) => r.met).length);
  level = computed(() => LEVELS[this.score()]);
  allMet = computed(() => this.score() === this.rules().length);
}
