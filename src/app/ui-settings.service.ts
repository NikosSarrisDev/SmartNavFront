import { Injectable, signal } from '@angular/core';
import { AuthenticationService } from './auth.service';
import { DataService } from './data.service';

export type UiTheme = 'light' | 'dark' | 'system';
export type UiMapStyle = 'standard' | 'satellite' | 'terrain';
export type UiDistanceUnit = 'km' | 'mi';
export type UiTimeFormat = '12h' | '24h';
export type UiChipDensity = 'compact' | 'comfortable';

export interface UiSettingsState {
  userId: number;
  aiAggressiveness: number;
  alwaysShowRouteExplanation: boolean;
  alternativeRoutesCount: number;
  theme: UiTheme;
  mapStyle: UiMapStyle;
  distanceUnit: UiDistanceUnit;
  timeFormat: UiTimeFormat;
  chipDensity: UiChipDensity;
  largeText: boolean;
  highContrast: boolean;
}

const DEFAULT_SETTINGS: UiSettingsState = {
  userId: 0,
  aiAggressiveness: 3,
  alwaysShowRouteExplanation: true,
  alternativeRoutesCount: 2,
  theme: 'system',
  mapStyle: 'standard',
  distanceUnit: 'km',
  timeFormat: '24h',
  chipDensity: 'comfortable',
  largeText: false,
  highContrast: false,
};

@Injectable({ providedIn: 'root' })
export class UiSettingsService {
  private readonly storageKey = 'smartnav_ui_settings';
  private readonly settingsState = signal<UiSettingsState>(DEFAULT_SETTINGS);
  readonly settings = this.settingsState.asReadonly();

  constructor(
    private readonly auth: AuthenticationService,
    private readonly dataService: DataService,
  ) {
    const cached = this.readSettingsFromStorage();
    if (cached) {
      this.settingsState.set(cached);
      this.applyDocumentSettings(cached);
    } else {
      this.applyDocumentSettings(DEFAULT_SETTINGS);
    }
  }

  bootstrapFromCurrentUser(): void {
    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.setSettings({
        ...DEFAULT_SETTINGS,
        userId: 0,
      });
      return;
    }

    this.loadByUserId(userId);
  }

  loadByUserId(userId: number): void {
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    this.dataService.getUserSettings({ userId }).subscribe({
      next: (response: any) => {
        this.setSettings(this.normalizeFromApi(response?.data, userId));
      },
      error: () => {
        this.setSettings({
          ...DEFAULT_SETTINGS,
          userId,
        });
      },
    });
  }

  applyFromSavedResponse(apiData: any): void {
    const userId = Number(apiData?.userId ?? this.settingsState().userId ?? 0);
    this.setSettings(this.normalizeFromApi(apiData, userId));
  }

  private setSettings(settings: UiSettingsState): void {
    this.settingsState.set(settings);
    this.applyDocumentSettings(settings);
    this.writeSettingsToStorage(settings);
  }

  private normalizeFromApi(apiData: any, userId: number): UiSettingsState {
    const theme = `${apiData?.theme ?? 'system'}`.trim().toLowerCase();
    const mapStyle = `${apiData?.mapStyle ?? 'standard'}`.trim().toLowerCase();
    const distanceUnit = `${apiData?.distanceUnit ?? 'km'}`.trim().toLowerCase();
    const timeFormat = `${apiData?.timeFormat ?? '24h'}`.trim().toLowerCase();
    const chipDensity = `${apiData?.chipDensity ?? 'comfortable'}`.trim().toLowerCase();

    return {
      userId: Number.isInteger(userId) && userId > 0 ? userId : 0,
      aiAggressiveness: this.clampNumber(apiData?.aiAggressiveness, 1, 5, 3),
      alwaysShowRouteExplanation: !!apiData?.alwaysShowRouteExplanation,
      alternativeRoutesCount: this.clampNumber(apiData?.alternativeRoutesCount, 1, 3, 2),
      theme: this.asTheme(theme),
      mapStyle: this.asMapStyle(mapStyle),
      distanceUnit: this.asDistanceUnit(distanceUnit),
      timeFormat: this.asTimeFormat(timeFormat),
      chipDensity: this.asChipDensity(chipDensity),
      largeText: !!apiData?.largeText,
      highContrast: !!apiData?.highContrast,
    };
  }

  private applyDocumentSettings(settings: UiSettingsState): void {
    if (typeof document === 'undefined') {
      return;
    }

    const body = document.body;
    if (!body) {
      return;
    }

    body.classList.toggle('sn-theme-light', settings.theme === 'light');
    body.classList.toggle('sn-theme-dark', settings.theme === 'dark');
    body.classList.toggle('sn-large-text', settings.largeText);
    body.classList.toggle('sn-high-contrast', settings.highContrast);
    body.classList.toggle('sn-chip-compact', settings.chipDensity === 'compact');
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  private asTheme(value: string): UiTheme {
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  }

  private asMapStyle(value: string): UiMapStyle {
    return value === 'satellite' || value === 'terrain' || value === 'standard'
      ? value
      : 'standard';
  }

  private asDistanceUnit(value: string): UiDistanceUnit {
    return value === 'mi' ? 'mi' : 'km';
  }

  private asTimeFormat(value: string): UiTimeFormat {
    return value === '12h' ? '12h' : '24h';
  }

  private asChipDensity(value: string): UiChipDensity {
    return value === 'compact' ? 'compact' : 'comfortable';
  }

  private readSettingsFromStorage(): UiSettingsState | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      return this.normalizeFromApi(parsed, Number(parsed?.userId ?? 0));
    } catch {
      return null;
    }
  }

  private writeSettingsToStorage(settings: UiSettingsState): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(settings));
    } catch {
      // ignore storage failures
    }
  }
}
