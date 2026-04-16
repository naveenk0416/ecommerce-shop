import { Component, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonButton, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle } from 'ionicons/icons';

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonButton, IonIcon
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  login = output<void>();
  getStarted = output<void>();

  constructor() {
    addIcons({ sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle });
  }
}
