import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { finalize, timeout } from 'rxjs/operators';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';
import { UiSettingsService } from '../../ui-settings.service';

@Component({
  selector: 'app-settings',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
    ProgressSpinnerModule,
    MenuModule,
    ButtonModule,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  readonly settingsForm;
  isLoading = false;
  isSaving = false;
  feedbackMessageKey = '';
  feedbackType: 'success' | 'error' = 'success';
  languages: MenuItem[] = [];
  private currentUserId: number | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private dataService: DataService,
    private auth: AuthenticationService,
    private router: Router,
    private translate: TranslateService,
    private uiSettings: UiSettingsService,
  ) {
    this.settingsForm = this.formBuilder.group({
      aiAggressiveness: [3],
      alwaysShowRouteExplanation: [true],
      alternativeRoutesCount: [2],
      theme: ['system'],
      mapStyle: ['standard'],
      distanceUnit: ['km'],
      timeFormat: ['24h'],
      chipDensity: ['comfortable'],
      largeText: [false],
      highContrast: [false],
    });
  }

  ngOnInit(): void {
    this.buildLanguageMenu();

    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.router.navigate(['/login']);
      return;
    }

    this.currentUserId = userId;
    this.loadSettings();
  }

  backToUser(): void {
    this.router.navigate(['/user']);
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang).subscribe(() => {
      this.buildLanguageMenu();
    });
  }

  saveSettings(): void {
    if (this.currentUserId == null || this.isSaving) {
      return;
    }

    const raw = this.settingsForm.getRawValue();
    this.isSaving = true;
    this.feedbackMessageKey = '';

    this.dataService
      .saveUserSettings({
        userId: this.currentUserId,
        aiAggressiveness: Number(raw.aiAggressiveness ?? 3),
        alwaysShowRouteExplanation: !!raw.alwaysShowRouteExplanation,
        alternativeRoutesCount: Number(raw.alternativeRoutesCount ?? 2),
        theme: `${raw.theme ?? 'system'}`,
        mapStyle: `${raw.mapStyle ?? 'standard'}`,
        distanceUnit: `${raw.distanceUnit ?? 'km'}`,
        timeFormat: `${raw.timeFormat ?? '24h'}`,
        chipDensity: `${raw.chipDensity ?? 'comfortable'}`,
        largeText: !!raw.largeText,
        highContrast: !!raw.highContrast,
      })
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (response: any) => {
          this.patchForm(response?.data);
          this.uiSettings.applyFromSavedResponse(response?.data);
          this.feedbackType = 'success';
          this.feedbackMessageKey = 'SETTINGS_SAVE_SUCCESS';
        },
        error: () => {
          this.feedbackType = 'error';
          this.feedbackMessageKey = 'SETTINGS_SAVE_ERROR';
        },
      });
  }

  private loadSettings(): void {
    if (this.currentUserId == null) {
      return;
    }

    this.isLoading = true;
    const loadFailSafe = window.setTimeout(() => {
      if (this.isLoading) {
        this.isLoading = false;
        this.feedbackType = 'error';
        this.feedbackMessageKey = 'SETTINGS_LOAD_ERROR';
      }
    }, 12000);

    this.dataService
      .getUserSettings({ userId: this.currentUserId })
      .pipe(timeout(15000))
      .pipe(
        finalize(() => {
          window.clearTimeout(loadFailSafe);
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: (response: any) => {
          this.patchForm(response?.data);
          this.uiSettings.applyFromSavedResponse(response?.data);
        },
        error: () => {
          this.feedbackType = 'error';
          this.feedbackMessageKey = 'SETTINGS_LOAD_ERROR';
        },
      });
  }

  private patchForm(data: any): void {
    if (!data) {
      return;
    }

    this.settingsForm.patchValue({
      aiAggressiveness: Number(data.aiAggressiveness ?? 3),
      alwaysShowRouteExplanation: !!data.alwaysShowRouteExplanation,
      alternativeRoutesCount: Number(data.alternativeRoutesCount ?? 2),
      theme: `${data.theme ?? 'system'}`,
      mapStyle: `${data.mapStyle ?? 'standard'}`,
      distanceUnit: `${data.distanceUnit ?? 'km'}`,
      timeFormat: `${data.timeFormat ?? '24h'}`,
      chipDensity: `${data.chipDensity ?? 'comfortable'}`,
      largeText: !!data.largeText,
      highContrast: !!data.highContrast,
    });
  }

  private buildLanguageMenu(): void {
    this.translate
      .get(['LANGUAGE_MENU_TITLE', 'LANGUAGE_OPTION_EL', 'LANGUAGE_OPTION_EN'])
      .subscribe((t) => {
        this.languages = [
          {
            label: t['LANGUAGE_MENU_TITLE'],
            items: [
              {
                label: t['LANGUAGE_OPTION_EL'],
                icon: '',
                command: () => this.changeLanguage('el'),
              },
              {
                label: t['LANGUAGE_OPTION_EN'],
                icon: '',
                command: () => this.changeLanguage('en'),
              },
            ],
          },
        ];
      });
  }
}
