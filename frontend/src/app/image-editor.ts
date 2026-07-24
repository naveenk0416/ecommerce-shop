import { Component, input, output, ElementRef, ViewChild, AfterViewInit, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonIcon, IonRange, IonLabel, IonSegment, IonSegmentButton, IonBadge, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmark, close, contrast, sunny, crop, colorPalette, text, trash, refresh, squareOutline, scanOutline, imageOutline } from 'ionicons/icons';
import { Canvas, FabricImage } from 'fabric';

@Component({
  selector: 'app-image-editor',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonRange, IonLabel, IonSegment, IonSegmentButton, IonBadge, IonSpinner],
  template: `
    <div class="editor-container bg-slate-900 rounded-[2rem] overflow-hidden flex flex-col h-[80vh] max-h-[800px] shadow-2xl border border-white/10 animate-in fade-in zoom-in duration-500">
      <!-- Top Bar -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <ion-icon name="image-outline" class="text-white"></ion-icon>
          </div>
          <div>
            <h3 class="text-white font-black text-sm tracking-tight">Image Studio</h3>
            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Manual Optimization</p>
          </div>
        </div>
        <div class="flex gap-2">
          <ion-button (click)="onCancel()" fill="clear" color="light" class="h-9 font-bold text-xs">
            Cancel
          </ion-button>
          <ion-button (click)="onComplete()" fill="solid" color="warning" class="h-9 font-black text-xs px-4" style="--border-radius: 12px;">
            <ion-icon name="checkmark" slot="start"></ion-icon>
            Apply Edits
          </ion-button>
        </div>
      </div>

      <!-- Main Canvas Area -->
      <div class="flex-grow relative bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-slate-800 flex items-center justify-center overflow-hidden p-8" #container>
        <div class="canvas-wrapper shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 relative">
          <canvas #canvasElement></canvas>
        </div>
        
        @if (isProcessing()) {
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
            <ion-spinner name="crescent" color="warning"></ion-spinner>
            <p class="text-white font-bold text-xs mt-4 tracking-widest uppercase">Processing...</p>
          </div>
        }
      </div>

      <!-- Bottom Controls -->
      <div class="bg-slate-950/80 backdrop-blur-xl border-t border-white/5 p-6 space-y-6">
        <ion-segment [value]="activeTool()" (ionChange)="activeTool.set($any($event).detail.value)" class="bg-slate-900/50 p-1 rounded-xl">
          <ion-segment-button value="adjust">
            <ion-icon name="sunny"></ion-icon>
            <ion-label class="text-[10px] font-bold">Adjust</ion-label>
          </ion-segment-button>
          <ion-segment-button value="background">
            <ion-icon name="color-palette"></ion-icon>
            <ion-label class="text-[10px] font-bold">Canvas</ion-label>
          </ion-segment-button>
        </ion-segment>

        <div class="tool-content min-h-[100px]">
          @if (activeTool() === 'adjust') {
            <div class="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
              <div class="space-y-1">
                <div class="flex justify-between items-center px-1">
                  <ion-label class="text-[10px] font-black uppercase tracking-widest text-slate-400">Brightness</ion-label>
                  <ion-badge color="dark" class="text-[8px] font-mono">{{brightness()}}</ion-badge>
                </div>
                <ion-range [min]="-1" [max]="1" [step]="0.01" [value]="brightness()" (ionInput)="onBrightnessChange($event)" class="ion-no-padding"></ion-range>
              </div>
              <div class="space-y-1">
                <div class="flex justify-between items-center px-1">
                  <ion-label class="text-[10px] font-black uppercase tracking-widest text-slate-400">Contrast</ion-label>
                  <ion-badge color="dark" class="text-[8px] font-mono">{{contrast()}}</ion-badge>
                </div>
                <ion-range [min]="-1" [max]="1" [step]="0.01" [value]="contrast()" (ionInput)="onContrastChange($event)" class="ion-no-padding"></ion-range>
              </div>
            </div>
          }

          @if (activeTool() === 'background') {
            <div class="flex flex-col gap-4 animate-in slide-in-from-bottom-2 duration-300">
               <ion-label class="text-[10px] font-black uppercase tracking-widest text-slate-400">Canvas Color</ion-label>
               <div class="flex flex-wrap gap-3">
                 @for (color of presetColors; track color) {
                   <button (click)="setBackgroundColor(color)" 
                           class="w-10 h-10 rounded-xl border-2 transition-all hover:scale-110 active:scale-95" 
                           [style.backgroundColor]="color"
                           [class.border-white]="bgColor() === color"
                           [class.border-transparent]="bgColor() !== color"
                           [class.shadow-[0_0_15px_rgba(255,255,255,0.2)]]="bgColor() === color">
                   </button>
                 }
                 <label class="w-10 h-10 rounded-xl bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors">
                   <ion-icon name="color-palette" class="text-slate-400"></ion-icon>
                   <input type="color" class="hidden" (input)="setBackgroundColor($any($event.target).value)">
                 </label>
               </div>
               
               <div class="flex items-center gap-4 mt-2">
                 <button (click)="resetImage()" class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors">
                   <ion-icon name="trash"></ion-icon> Reset Layout
                 </button>
                 <button (click)="centerImage()" class="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors">
                   <ion-icon name="scan-outline"></ion-icon> Center Object
                 </button>
               </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
    ion-range {
      --bar-background: #1e293b;
      --bar-background-active: #f97316;
      --knob-background: #ffffff;
      --knob-size: 16px;
      padding-top: 0;
      padding-bottom: 0;
    }
    ion-segment {
      --background: transparent;
    }
    ion-segment-button {
      --color: #94a3b8;
      --color-checked: #ffffff;
      --indicator-color: #f97316;
      min-height: 44px;
    }
    .canvas-wrapper {
      max-width: 100%;
      max-height: 100%;
    }
  `]
})
export class ImageEditor implements AfterViewInit, OnDestroy {
  imageSrc = input.required<string>();
  done = output<string>();
  closeEditor = output<void>();

  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container') container!: ElementRef<HTMLDivElement>;

  private canvas?: Canvas;
  private fabricImg?: FabricImage;

  activeTool = signal<'adjust' | 'background'>('adjust');
  brightness = signal(0);
  contrast = signal(0);
  bgColor = signal('#ffffff');
  isProcessing = signal(false);

  presetColors = ['#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#000000', '#fef2f2', '#f0fdf4', '#eff6ff'];

  constructor() {
    addIcons({ checkmark, close, contrast, sunny, crop, colorPalette, text, trash, refresh, squareOutline, scanOutline, imageOutline });
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  ngOnDestroy() {
    this.canvas?.dispose();
  }

  private async initCanvas() {
    this.isProcessing.set(true);
    
    // Create canvas with 1:1 aspect ratio for marketplace standards
    const size = Math.min(this.container.nativeElement.offsetWidth - 64, 500);
    
    this.canvas = new Canvas(this.canvasElement.nativeElement, {
      width: size,
      height: size,
      backgroundColor: this.bgColor()
    });

    try {
      this.fabricImg = await FabricImage.fromURL(this.imageSrc(), { crossOrigin: 'anonymous' });
      
      // Auto-scale to fit roughly nicely
      const padding = 40;
      const scale = Math.min(
        (size - padding) / this.fabricImg.width,
        (size - padding) / this.fabricImg.height
      );

      this.fabricImg.set({
        scaleX: scale,
        scaleY: scale,
        left: size / 2,
        top: size / 2,
        originX: 'center',
        originY: 'center',
        cornerStyle: 'circle',
        transparentCorners: false,
        cornerColor: '#f97316',
        cornerStrokeColor: '#ffffff',
        borderColor: '#f97316',
        padding: 10
      });

      this.canvas.add(this.fabricImg);
      this.canvas.setActiveObject(this.fabricImg);
      this.canvas.renderAll();
    } catch (e) {
      console.error('Failed to init fabric image', e);
    } finally {
      this.isProcessing.set(false);
    }
  }

  onBrightnessChange(event: { detail: { value: number | { lower: number; upper: number } } }) {
    const val = typeof event.detail.value === 'number' ? event.detail.value : event.detail.value.lower;
    this.brightness.set(val);
    this.applyFilters();
  }

  onContrastChange(event: { detail: { value: number | { lower: number; upper: number } } }) {
    const val = typeof event.detail.value === 'number' ? event.detail.value : event.detail.value.lower;
    this.contrast.set(val);
    this.applyFilters();
  }

  setBackgroundColor(color: string) {
    this.bgColor.set(color);
    if (this.canvas) {
      this.canvas.set({ backgroundColor: color });
      this.canvas.renderAll();
    }
  }

  centerImage() {
    if (!this.canvas || !this.fabricImg) return;
    this.fabricImg.set({
      left: this.canvas.width / 2,
      top: this.canvas.height / 2
    });
    this.canvas.renderAll();
  }

  resetImage() {
    if (!this.canvas || !this.fabricImg) return;
    this.initCanvas();
    this.brightness.set(0);
    this.contrast.set(0);
  }

  private applyFilters() {
    if (!this.fabricImg || !this.canvas) return;
    // Simple filter placeholder for now, Fabric 6 filters are object-based
    this.canvas.renderAll();
  }

  onComplete() {
    if (!this.canvas) return;
    const dataUrl = this.canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier: 1
    });
    this.done.emit(dataUrl);
  }

  onCancel() {
    this.closeEditor.emit();
  }
}
