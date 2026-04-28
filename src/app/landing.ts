import { Component, output, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonButton, IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, analytics, globe, logoAmazon, logoInstagram, logoTwitter, logoLinkedin, sparkles, flash, rocket, shieldCheckmark, arrowForward, logoGoogle, image, copy, settings, checkmarkCircle, chevronForward, text, documentText, cash, time, school, statsChart, trendingUp, logoFacebook } from 'ionicons/icons';

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
  goDashboard = output<void>();

  isLoggedIn = input<boolean>(false);

  constructor() {
    addIcons({school,arrowForward,checkmarkCircle,camera,text,documentText,cash,logoInstagram,time,trendingUp,logoFacebook,logoTwitter,analytics,globe,logoAmazon,logoLinkedin,sparkles,flash,rocket,shieldCheckmark,logoGoogle,image,copy,settings,chevronForward,statsChart});
  }
}
