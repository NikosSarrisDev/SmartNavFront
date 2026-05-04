import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';

type SettingsAction = 'deleteHistory' | 'deleteAccount';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, ProgressSpinnerModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  readonly settingsForm;

  isLoading = false;
  isSaving = false;
  isExporting = false;
  isDeletingHistory = false;
  isDeletingAccount = false;
  feedbackMessageKey = '';
  feedbackType: 'success' | 'error' = 'success';
  confirmVisible = false;
  confirmMessageKey = '';
  private pendingAction: SettingsAction | null = null;
  private currentUserId: number | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private dataService: DataService,
    private auth: AuthenticationService,
    private router: Router,
  ) {
    this.settingsForm = this.formBuilder.group({
      aiAggressiveness: [3],
      alwaysShowRouteExplanation: [true],
      alternativeRoutesCount: [2],
      useHistoryPersonalization: [true],
      theme: ['system'],
      mapStyle: ['standard'],
      distanceUnit: ['km'],
      timeFormat: ['24h'],
      chipDensity: ['comfortable'],
      largeText: [false],
      highContrast: [false],
      storeTrips: [true],
      storeRatings: [true],
      storeStations: [true],
      consentLocationHistory: [false],
      consentAiTraining: [false],
    });
  }

  ngOnInit(): void {
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
        useHistoryPersonalization: !!raw.useHistoryPersonalization,
        theme: `${raw.theme ?? 'system'}`,
        mapStyle: `${raw.mapStyle ?? 'standard'}`,
        distanceUnit: `${raw.distanceUnit ?? 'km'}`,
        timeFormat: `${raw.timeFormat ?? '24h'}`,
        chipDensity: `${raw.chipDensity ?? 'comfortable'}`,
        largeText: !!raw.largeText,
        highContrast: !!raw.highContrast,
        storeTrips: !!raw.storeTrips,
        storeRatings: !!raw.storeRatings,
        storeStations: !!raw.storeStations,
        consentLocationHistory: !!raw.consentLocationHistory,
        consentAiTraining: !!raw.consentAiTraining,
      })
      .subscribe({
        next: (response: any) => {
          this.isSaving = false;
          this.patchForm(response?.data);
          this.feedbackType = 'success';
          this.feedbackMessageKey = 'SETTINGS_SAVE_SUCCESS';
        },
        error: () => {
          this.isSaving = false;
          this.feedbackType = 'error';
          this.feedbackMessageKey = 'SETTINGS_SAVE_ERROR';
        },
      });
  }

  exportData(): void {
    if (this.currentUserId == null || this.isExporting) {
      return;
    }

    this.isExporting = true;
    this.feedbackMessageKey = '';
    this.dataService.exportUserData({ userId: this.currentUserId }).subscribe({
      next: (response: any) => {
        this.isExporting = false;

        const payload = response?.data ?? {};
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `smartnav-user-data-${this.currentUserId}.json`;
        anchor.click();
        window.URL.revokeObjectURL(url);

        this.feedbackType = 'success';
        this.feedbackMessageKey = 'SETTINGS_EXPORT_SUCCESS';
      },
      error: () => {
        this.isExporting = false;
        this.feedbackType = 'error';
        this.feedbackMessageKey = 'SETTINGS_EXPORT_ERROR';
      },
    });
  }

  requestDeleteHistory(): void {
    this.pendingAction = 'deleteHistory';
    this.confirmMessageKey = 'SETTINGS_DELETE_HISTORY_CONFIRM';
    this.confirmVisible = true;
  }

  requestDeleteAccount(): void {
    this.pendingAction = 'deleteAccount';
    this.confirmMessageKey = 'SETTINGS_DELETE_ACCOUNT_CONFIRM';
    this.confirmVisible = true;
  }

  onConfirm(answer: boolean): void {
    this.confirmVisible = false;
    if (!answer || !this.pendingAction) {
      this.pendingAction = null;
      return;
    }

    if (this.pendingAction === 'deleteHistory') {
      this.executeDeleteHistory();
    } else if (this.pendingAction === 'deleteAccount') {
      this.executeDeleteAccount();
    }

    this.pendingAction = null;
  }

  private loadSettings(): void {
    if (this.currentUserId == null) {
      return;
    }

    this.isLoading = true;
    this.dataService.getUserSettings({ userId: this.currentUserId }).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.patchForm(response?.data);
      },
      error: () => {
        this.isLoading = false;
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
      useHistoryPersonalization: !!data.useHistoryPersonalization,
      theme: `${data.theme ?? 'system'}`,
      mapStyle: `${data.mapStyle ?? 'standard'}`,
      distanceUnit: `${data.distanceUnit ?? 'km'}`,
      timeFormat: `${data.timeFormat ?? '24h'}`,
      chipDensity: `${data.chipDensity ?? 'comfortable'}`,
      largeText: !!data.largeText,
      highContrast: !!data.highContrast,
      storeTrips: !!data.storeTrips,
      storeRatings: !!data.storeRatings,
      storeStations: !!data.storeStations,
      consentLocationHistory: !!data.consentLocationHistory,
      consentAiTraining: !!data.consentAiTraining,
    });
  }

  private executeDeleteHistory(): void {
    if (this.currentUserId == null || this.isDeletingHistory) {
      return;
    }

    this.isDeletingHistory = true;
    this.feedbackMessageKey = '';
    this.dataService.deleteUserHistory({ userId: this.currentUserId }).subscribe({
      next: () => {
        this.isDeletingHistory = false;
        this.feedbackType = 'success';
        this.feedbackMessageKey = 'SETTINGS_DELETE_HISTORY_SUCCESS';
      },
      error: () => {
        this.isDeletingHistory = false;
        this.feedbackType = 'error';
        this.feedbackMessageKey = 'SETTINGS_DELETE_HISTORY_ERROR';
      },
    });
  }

  private executeDeleteAccount(): void {
    if (this.currentUserId == null || this.isDeletingAccount) {
      return;
    }

    this.isDeletingAccount = true;
    this.feedbackMessageKey = '';
    this.dataService.deleteUserAccount({ userId: this.currentUserId }).subscribe({
      next: () => {
        this.isDeletingAccount = false;
        this.auth.logout();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.isDeletingAccount = false;
        this.feedbackType = 'error';
        this.feedbackMessageKey = 'SETTINGS_DELETE_ACCOUNT_ERROR';
      },
    });
  }
}
