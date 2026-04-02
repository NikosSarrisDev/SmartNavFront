import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { JourneyFilterStation, NavigationService, VehicleSize } from '../../navigation.service';

type JourneyStationForm = FormGroup;

@Component({
  selector: 'app-filter-options',
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, Button, Menu, MenuModule],
  templateUrl: './filter-options.html',
  styleUrl: './filter-options.css',
})
export class FilterOptions implements OnInit {
  readonly stationForms: FormGroup;
  languages: MenuItem[] | undefined;
  readonly vehicleSizeOptions: { value: VehicleSize; labelKey: string }[] = [
    { value: 'small', labelKey: 'FILTER_VEHICLE_SIZE_SMALL' },
    { value: 'medium', labelKey: 'FILTER_VEHICLE_SIZE_MEDIUM' },
    { value: 'large', labelKey: 'FILTER_VEHICLE_SIZE_LARGE' },
    { value: 'truck', labelKey: 'FILTER_VEHICLE_SIZE_TRUCK' },
  ];

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private translate: TranslateService,
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
    this.translate.use(activeLang);
    this.buildLanguageMenu();
  }

  get stations(): FormArray<JourneyStationForm> {
    return this.stationForms.get('stations') as FormArray<JourneyStationForm>;
  }

  addStation(): void {
    this.stations.push(this.createStationGroup(this.createBlankStation()));
  }

  removeStation(index: number): void {
    if (index >= 0 && index < this.stations.length) {
      this.stations.removeAt(index);
    }
  }

  cancel(): void {
    this.router.navigate(['/home']);
  }

  apply(): void {
    const filters = this.stations.getRawValue() as JourneyFilterStation[];
    const vehicleSizeRaw = `${this.stationForms.get('vehicleSize')?.value ?? ''}`.trim();
    const vehicleSize = this.isVehicleSize(vehicleSizeRaw) ? vehicleSizeRaw : null;
    this.navigationService.setJourneyFilters(filters);
    this.navigationService.setVehicleSize(vehicleSize);
    this.router.navigate(['/home']);
  }

  getStationTitle(index: number): string {
    return `${this.translate.instant('FILTER_STATION')} ${index + 1}`;
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang);
    this.buildLanguageMenu();
  }

  private buildLanguageMenu(): void {
    this.languages = [
      {
        label: this.translate.instant('LANGUAGE_MENU_TITLE'),
        items: [
          {
            label: this.translate.instant('LANGUAGE_OPTION_EL'),
            command: () => {
              this.changeLanguage('el');
            },
          },
          {
            label: this.translate.instant('LANGUAGE_OPTION_EN'),
            command: () => {
              this.changeLanguage('en');
            },
          },
        ],
      },
    ];
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
    return value === 'small' || value === 'medium' || value === 'large' || value === 'truck';
  }
}
