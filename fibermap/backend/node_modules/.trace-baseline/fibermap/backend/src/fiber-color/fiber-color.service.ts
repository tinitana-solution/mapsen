import { Injectable } from '@nestjs/common';

@Injectable()
export class FiberColorService {
  // Standard 12-color sequence (TIA-598-C)
  private readonly STANDARD_COLORS = [
    'BLUE', 'ORANGE', 'GREEN', 'BROWN', 'SLATE', 'WHITE',
    'RED', 'BLACK', 'YELLOW', 'VIOLET', 'ROSE', 'AQUA'
  ];

  /**
   * Returns the color name for a given fiber or tube number (1-indexed).
   * For counts > 12, it repeats the pattern. In a real scenario, stripes could be used.
   */
  getColorForNumber(num: number): string {
    if (num <= 0) return 'UNKNOWN';
    // 0-indexed position
    const index = (num - 1) % this.STANDARD_COLORS.length;
    return this.STANDARD_COLORS[index];
  }

  getAllColors(): string[] {
    return [...this.STANDARD_COLORS];
  }
}
