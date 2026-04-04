import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { JourneyFilterStation, NavigationService, VehicleSize } from '../../navigation.service';
import { DataService } from '../../data.service';

type JourneyStationForm = FormGroup;

@Component({
  selector: 'app-filter-options',
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, Button, Menu, MenuModule],
  templateUrl: './filter-options.html',
  styleUrl: './filter-options.css',
})
export class FilterOptions implements OnInit, OnDestroy {
  @Input() inModal = false;
  @Output() closed = new EventEmitter<void>();

  readonly maxStations = 10;
  readonly stationForms: FormGroup;
  languages: MenuItem[] | undefined;
  readonly vehicleSizeOptions = signal<{ value: VehicleSize; translationField: string }[]>([]);

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private translate: TranslateService,
    private dataService: DataService,
  ) {
    this.stationForms = this.formBuilder.group({
      stations: this.formBuilder.array([] as JourneyStationForm[]),
      vehicleSize: [''],
    });

    const existingStations = this.navigationService.getJourneyFiltersSnapshot();
    const existingVehicleSize = this.navigationService.getVehicleSizeSnapshot();
    this.stationForms.patchValue({ vehicleSize: existingVehicleSize ?? '' });
    existingStations.forEach((filter) => this.stations.push(this.createStationGroup(filter)));
  }

  ngOnInit(): void {
    const activeLang = this.translate.currentLang || this.translate.getFallbackLang() || 'el';
    this.translate.use(activeLang).subscribe({
      next: () => {
        this.buildLanguageMenu();
      },
      error: () => {
        this.buildLanguageMenu();
      },
    });
    this.loadVehicleOptions();
  }

  ngOnDestroy(): void {}

  get stations(): FormArray<JourneyStationForm> {
    return this.stationForms.get('stations') as FormArray<JourneyStationForm>;
  }

  get canAddStation(): boolean {
    return this.stations.length < this.maxStations;
  }

  addStation(): void {
    if (!this.canAddStation) {
      return;
    }

    this.stations.push(this.createStationGroup(this.createBlankStation()));
  }

  removeStation(index: number): void {
    if (index >= 0 && index < this.stations.length) {
      this.stations.removeAt(index);
    }
  }

  confirmRemoveStation(index: number): void {
    if (index < 0 || index >= this.stations.length) {
      return;
    }

    const message = this.translate.instant('FILTER_REMOVE_STATION_CONFIRM', {
      station: index + 1,
    });

    if (window.confirm(message)) {
      this.removeStation(index);
    }
  }

  removeAllStations(): void {
    if (this.stations.length === 0) {
      return;
    }

    const message = this.translate.instant('FILTER_REMOVE_ALL_STATIONS_CONFIRM', {
      count: this.stations.length,
    });

    if (window.confirm(message)) {
      this.stations.clear();
    }
  }

  cancel(): void {
    if (this.inModal) {
      this.closed.emit();
      return;
    }

    this.router.navigate(['/home']);
  }

  apply(): void {
    const filters = this.stations.getRawValue() as JourneyFilterStation[];
    const vehicleSizeRaw = `${this.stationForms.get('vehicleSize')?.value ?? ''}`.trim();
    const vehicleSize = this.isVehicleSize(vehicleSizeRaw) ? vehicleSizeRaw : null;
    this.navigationService.setJourneyFilters(filters);
    this.navigationService.setVehicleSize(vehicleSize);

    if (this.inModal) {
      this.closed.emit();
      return;
    }

    this.router.navigate(['/home']);
  }

  getStationTitle(index: number): string {
    return `${this.translate.instant('FILTER_STATION')} ${index + 1}`;
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang).subscribe({
      next: () => {
        this.buildLanguageMenu();
      },
      error: () => {
        this.buildLanguageMenu();
      },
    });
  }

  private buildLanguageMenu(): void {
    this.translate
      .get(['LANGUAGE_MENU_TITLE', 'LANGUAGE_OPTION_EL', 'LANGUAGE_OPTION_EN'])
      .subscribe((labels) => {
        this.languages = [
          {
            label: labels['LANGUAGE_MENU_TITLE'],
            items: [
              {
                label: labels['LANGUAGE_OPTION_EL'],
                command: () => {
                  this.changeLanguage('el');
                },
              },
              {
                label: labels['LANGUAGE_OPTION_EN'],
                command: () => {
                  this.changeLanguage('en');
                },
              },
            ],
          },
        ];
      });
  }

  private createStationGroup(filter: JourneyFilterStation): JourneyStationForm {
    return this.formBuilder.group({
      street: [filter.street],
      number: [filter.number],
      cityArea: [filter.cityArea],
      postalCode: [filter.postalCode],
    });
  }

  private createBlankStation(): JourneyFilterStation {
    return {
      street: '',
      number: '',
      cityArea: '',
      postalCode: '',
    };
  }

  private isVehicleSize(value: string): value is VehicleSize {
    return (
      value === 'small' ||
      value === 'medium' ||
      value === 'large' ||
      value === 'truck' ||
      value === 'motorcycle'
    );
  }

  private loadVehicleOptions(): void {
    this.dataService.getVehicles({}).subscribe({
      next: (response: any) => {
        const backendOptions = (response?.data ?? [])
          .map((vehicle: any) => {
            const code = `${vehicle?.code ?? vehicle?.Code ?? ''}`.trim().toLowerCase();
            const translationField =
              `${vehicle?.translationField ?? vehicle?.TranslationField ?? ''}`.trim();

            if (!this.isVehicleSize(code)) {
              return null;
            }

            return {
              value: code,
              translationField,
            };
          })
          .filter((value: any) => value != null && value.translationField.length > 0);

        this.vehicleSizeOptions.set(backendOptions);
      },
      error: () => {
        this.vehicleSizeOptions.set([]);
      },
    });
  }
}
