import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { JourneyFilterStation, NavigationService } from '../../navigation.service';

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

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private translate: TranslateService,
  ) {
    this.stationForms = this.formBuilder.group({
      stations: this.formBuilder.array([] as JourneyStationForm[]),
    });

    const existingFilters = this.navigationService.getJourneyFiltersSnapshot();
    const filtersToLoad = existingFilters.length ? existingFilters : this.buildDefaultFilters();

    filtersToLoad.forEach((filter) => this.stations.push(this.createStationGroup(filter)));
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
    this.stations.insert(
      this.stations.length - 1,
      this.createStationGroup({ type: 'station', ...this.createBlankStation() }),
    );
  }

  cancel(): void {
    this.router.navigate(['/home']);
  }

  apply(): void {
    const filters = this.stations.getRawValue() as JourneyFilterStation[];
    this.navigationService.setJourneyFilters(filters);
    this.router.navigate(['/home']);
  }

  getStationTitle(index: number): string {
    const type = this.stations.at(index).get('type')?.value;

    if (type === 'start') {
      return this.translate.instant('FILTER_START');
    }

    if (type === 'finish') {
      return this.translate.instant('FILTER_FINISH');
    }

    return `${this.translate.instant('FILTER_STATION')} ${index}`;
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
      type: [filter.type],
      street: [filter.street],
      number: [filter.number],
      cityArea: [filter.cityArea],
      postalCode: [filter.postalCode],
    });
  }

  private buildDefaultFilters(): JourneyFilterStation[] {
    return [
      { type: 'start', ...this.createBlankStation() },
      { type: 'finish', ...this.createBlankStation() },
    ];
  }

  private createBlankStation(): Omit<JourneyFilterStation, 'type'> {
    return {
      street: '',
      number: '',
      cityArea: '',
      postalCode: '',
    };
  }
}
