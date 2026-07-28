import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/** Minimal shape of the experimental Shape Detection API's BarcodeDetector — not yet in lib.dom.d.ts. */
interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface NativeBarcodeDetectorCtor {
  new (options?: { formats: string[] }): NativeBarcodeDetector;
  getSupportedFormats?(): Promise<string[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetectorCtor;
  }
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'];

/**
 * Live camera barcode scanner shown as a dialog. Prefers the browser's native BarcodeDetector
 * (Chrome/Edge) and falls back to the ZXing JS decoder (Safari/Firefox and anywhere else the
 * native API is unavailable) — both paths share the same getUserMedia video stream.
 */
@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './barcode-scanner-dialog.html',
  styleUrl: './barcode-scanner-dialog.scss',
})
export class BarcodeScannerDialog implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<BarcodeScannerDialog, string>);

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  error = signal<string | null>(null);
  usingFallback = signal(false);

  private stream: MediaStream | null = null;
  private zxingControls: IScannerControls | null = null;
  private detectorLoopHandle: number | null = null;
  private stopped = false;

  ngAfterViewInit(): void {
    void this.start();
  }

  private async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch {
      this.error.set('Camera access was denied. Please allow camera permission and try again.');
      return;
    }

    const video = this.videoRef?.nativeElement;
    if (!video || this.stopped) return;

    video.srcObject = this.stream;
    video.setAttribute('playsinline', 'true');
    await video.play().catch(() => undefined);

    if (window.BarcodeDetector) {
      this.runNativeDetector(video);
    } else {
      this.usingFallback.set(true);
      void this.runZXingFallback(video);
    }
  }

  private runNativeDetector(video: HTMLVideoElement): void {
    const detector = new window.BarcodeDetector!({ formats: BARCODE_FORMATS });

    const tick = async () => {
      if (this.stopped) return;
      try {
        const results = await detector.detect(video);
        if (results.length > 0) {
          this.finish(results[0].rawValue);
          return;
        }
      } catch {
        // A single failed frame isn't fatal — keep scanning.
      }
      if (!this.stopped) {
        this.detectorLoopHandle = requestAnimationFrame(tick);
      }
    };
    this.detectorLoopHandle = requestAnimationFrame(tick);
  }

  private async runZXingFallback(video: HTMLVideoElement): Promise<void> {
    const reader = new BrowserMultiFormatReader();
    try {
      this.zxingControls = await reader.decodeFromVideoElement(video, (result) => {
        if (result && !this.stopped) {
          this.finish(result.getText());
        }
      });
    } catch {
      this.error.set('Unable to start the barcode scanner on this device.');
    }
  }

  private finish(code: string): void {
    if (this.stopped) return;
    this.stopped = true;
    this.dialogRef.close(code);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.stopped = true;
    if (this.detectorLoopHandle !== null) {
      cancelAnimationFrame(this.detectorLoopHandle);
    }
    this.zxingControls?.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
