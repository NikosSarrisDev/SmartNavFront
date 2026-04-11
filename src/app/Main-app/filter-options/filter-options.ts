import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import {
  JourneyFilterStation,
  JourneyRouteFilters,
  NavigationService,
  TrafficTimeMode,
  VehicleSize,
} from '../../navigation.service';
import { DataService } from '../../data.service';

type JourneyStationForm = FormGroup;
type StationAddressSuggestion = {
  placeId: string;
  description: string;
};

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
  readonly trafficTimeModeOptions: { value: TrafficTimeMode; translationField: string }[] = [
    { value: 'none', translationField: 'FILTER_TRAFFIC_TIME_MODE_NONE' },
    { value: 'departure', translationField: 'FILTER_TRAFFIC_TIME_MODE_DEPARTURE' },
    { value: 'arrival', translationField: 'FILTER_TRAFFIC_TIME_MODE_ARRIVAL' },
  ];
  private autocompleteService: google.maps.places.AutocompleteService | null = null;
  private placeDetailsService: google.maps.places.PlacesService | null = null;
  private autocompleteSessionToken: google.maps.places.AutocompleteSessionToken | null = null;
  private hideSuggestionsTimeout: number | null = null;
  private readonly pendingAutocompleteRequests = new Map<number, number>();
  private readonly stationSuggestions = signal<Record<number, StationAddressSuggestion[]>>({});
  activeSuggestionIndex: number | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private translate: TranslateService,
    private dataService: DataService,
  ) {
    this.stationForms = this.formBuilder.group({
      stations: this.formBuilder.array([] as JourneyStationForm[], {
        validators: [this.duplicateStationsValidator()],
      }),
      vehicleSize: [''],
      avoidTolls: [false],
      avoidHighways: [false],
      avoidFerries: [false],
      trafficTimeMode: ['none'],
      trafficDateTime: [''],
      includeEvChargingStations: [false],
    });

    const existingStations = this.navigationService.getJourneyFiltersSnapshot();
    const existingVehicleSize = this.navigationService.getVehicleSizeSnapshot();
    const existingRouteFilters = this.navigationService.getJourneyRouteFiltersSnapshot();
    this.stationForms.patchValue({
      vehicleSize: existingVehicleSize ?? '',
      avoidTolls: existingRouteFilters.avoidTolls,
      avoidHighways: existingRouteFilters.avoidHighways,
      avoidFerries: existingRouteFilters.avoidFerries,
      trafficTimeMode: existingRouteFilters.trafficTimeMode,
      trafficDateTime: existingRouteFilters.trafficDateTime ?? '',
      includeEvChargingStations: existingRouteFilters.includeEvChargingStations,
    });
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
    this.initializeAutocompleteServices();
  }

  ngOnDestroy(): void {
    this.clearHideSuggestionsTimeout();
  }

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
      this.clearAllStationSuggestions();
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
      this.clearAllStationSuggestions();
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
    if (this.stationForms.invalid) {
      this.stationForms.markAllAsTouched();
      return;
    }

    const filters = this.stations.getRawValue() as JourneyFilterStation[];
    const vehicleSizeRaw = `${this.stationForms.get('vehicleSize')?.value ?? ''}`.trim();
    const vehicleSize = this.isVehicleSize(vehicleSizeRaw) ? vehicleSizeRaw : null;
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw) ? trafficTimeModeRaw : 'none';
    const trafficDateTimeRaw = `${this.stationForms.get('trafficDateTime')?.value ?? ''}`.trim();
    const routeFilters: JourneyRouteFilters = {
      avoidTolls: !!this.stationForms.get('avoidTolls')?.value,
      avoidHighways: !!this.stationForms.get('avoidHighways')?.value,
      avoidFerries: !!this.stationForms.get('avoidFerries')?.value,
      trafficTimeMode,
      trafficDateTime: this.normalizeTrafficDateTime(trafficTimeMode, trafficDateTimeRaw),
      includeEvChargingStations: !!this.stationForms.get('includeEvChargingStations')?.value,
    };

    this.navigationService.setJourneyFilters(filters);
    this.navigationService.setVehicleSize(vehicleSize);
    this.navigationService.setJourneyRouteFilters(routeFilters);

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

  hasDuplicateStationsError(): boolean {
    const hasDuplicateAddress = this.stations.hasError('duplicateStationAddress');
    if (!hasDuplicateAddress) {
      return false;
    }

    return this.stations.touched || this.stationForms.touched || this.stations.dirty;
  }

  onTrafficTimeModeChange(): void {
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw) ? trafficTimeModeRaw : 'none';

    if (trafficTimeMode === 'none') {
      this.stationForms.patchValue({ trafficDateTime: '' });
    }
  }

  shouldShowTrafficDateTime(): boolean {
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw) ? trafficTimeModeRaw : 'none';
    return trafficTimeMode !== 'none';
  }

  onStationStreetInput(index: number): void {
    this.clearHideSuggestionsTimeout();

    const stationGroup = this.getStationGroup(index);
    if (!stationGroup || !this.autocompleteService) {
      this.setStationSuggestions(index, []);
      return;
    }

    const streetValue = `${stationGroup.get('street')?.value ?? ''}`.trim();
    if (!streetValue) {
      this.setStationSuggestions(index, []);
      return;
    }

    const requestVersion = (this.pendingAutocompleteRequests.get(index) ?? 0) + 1;
    this.pendingAutocompleteRequests.set(index, requestVersion);
    const request: google.maps.places.AutocompletionRequest = {
      input: this.buildAutocompleteQuery(stationGroup),
      sessionToken: this.getAutocompleteSessionToken(),
      types: ['address'],
    };

    this.autocompleteService.getPlacePredictions(request, (predictions, status) => {
      if ((this.pendingAutocompleteRequests.get(index) ?? 0) !== requestVersion) {
        return;
      }

      if (
        status !== google.maps.places.PlacesServiceStatus.OK ||
        !predictions ||
        predictions.length === 0
      ) {
        this.setStationSuggestions(index, []);
        return;
      }

      const nextSuggestions = predictions
        .filter(
          (prediction) =>
            !!prediction.place_id &&
            prediction.place_id.length > 0 &&
            !!prediction.description &&
            prediction.description.length > 0,
        )
        .slice(0, 6)
        .map((prediction) => ({
          placeId: prediction.place_id,
          description: prediction.description,
        }));

      this.setStationSuggestions(index, nextSuggestions);
    });
  }

  onStationStreetFocus(index: number): void {
    this.clearHideSuggestionsTimeout();
    if (this.getStationSuggestions(index).length > 0) {
      this.activeSuggestionIndex = index;
    }
  }

  onStationStreetBlur(index: number): void {
    this.clearHideSuggestionsTimeout();
    this.hideSuggestionsTimeout = window.setTimeout(() => {
      if (this.activeSuggestionIndex === index) {
        this.activeSuggestionIndex = null;
      }
    }, 120);
  }

  getStationSuggestions(index: number): StationAddressSuggestion[] {
    return this.stationSuggestions()[index] ?? [];
  }

  isStationSuggestionListVisible(index: number): boolean {
    return this.activeSuggestionIndex === index && this.getStationSuggestions(index).length > 0;
  }

  selectStationSuggestion(
    index: number,
    suggestion: StationAddressSuggestion,
    event: MouseEvent,
  ): void {
    event.preventDefault();
    this.clearHideSuggestionsTimeout();

    const stationGroup = this.getStationGroup(index);
    if (!stationGroup || !this.placeDetailsService) {
      this.setStationSuggestions(index, []);
      return;
    }

    const request: google.maps.places.PlaceDetailsRequest = {
      placeId: suggestion.placeId,
      fields: ['address_components', 'formatted_address', 'name'],
      sessionToken: this.autocompleteSessionToken ?? undefined,
    };

    this.placeDetailsService.getDetails(request, (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        return;
      }

      const currentAddress = stationGroup.getRawValue() as JourneyFilterStation;
      const parsedAddress = this.parseAddressFromPlace(place);

      stationGroup.patchValue({
        street: parsedAddress.street || currentAddress.street,
        number: parsedAddress.number || currentAddress.number,
        cityArea: parsedAddress.cityArea || currentAddress.cityArea,
        postalCode: parsedAddress.postalCode || currentAddress.postalCode,
      });
      stationGroup.markAsDirty();
      stationGroup.markAllAsTouched();

      this.autocompleteSessionToken = null;
      this.setStationSuggestions(index, []);
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

  private initializeAutocompleteServices(): void {
    if (
      typeof google === 'undefined' ||
      !google.maps?.places?.AutocompleteService ||
      !google.maps?.places?.PlacesService
    ) {
      return;
    }

    this.autocompleteService = new google.maps.places.AutocompleteService();
    this.placeDetailsService = new google.maps.places.PlacesService(document.createElement('div'));
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

  private getAutocompleteSessionToken(): google.maps.places.AutocompleteSessionToken | undefined {
    if (
      !this.autocompleteSessionToken &&
      typeof google !== 'undefined' &&
      !!google.maps?.places?.AutocompleteSessionToken
    ) {
      this.autocompleteSessionToken = new google.maps.places.AutocompleteSessionToken();
    }

    return this.autocompleteSessionToken ?? undefined;
  }

  private getStationGroup(index: number): JourneyStationForm | null {
    if (index < 0 || index >= this.stations.length) {
      return null;
    }

    return this.stations.at(index) as JourneyStationForm;
  }

  private buildAutocompleteQuery(stationGroup: JourneyStationForm): string {
    const street = `${stationGroup.get('street')?.value ?? ''}`.trim();
    const number = `${stationGroup.get('number')?.value ?? ''}`.trim();
    const cityArea = `${stationGroup.get('cityArea')?.value ?? ''}`.trim();
    const postalCode = `${stationGroup.get('postalCode')?.value ?? ''}`.trim();

    return [street, number, cityArea, postalCode].filter((value) => value.length > 0).join(' ');
  }

  private parseAddressFromPlace(place: google.maps.places.PlaceResult): JourneyFilterStation {
    const components = place.address_components ?? [];
    const street =
      this.getAddressComponent(components, 'route') ||
      this.getFirstAddressSegment(place.formatted_address) ||
      `${place.name ?? ''}`.trim();

    return {
      street,
      number: this.getAddressComponent(components, 'street_number'),
      cityArea:
        this.getAddressComponent(components, 'locality') ||
        this.getAddressComponent(components, 'postal_town') ||
        this.getAddressComponent(components, 'administrative_area_level_3') ||
        this.getAddressComponent(components, 'sublocality') ||
        this.getAddressComponent(components, 'administrative_area_level_2'),
      postalCode: this.getAddressComponent(components, 'postal_code'),
    };
  }

  private getAddressComponent(
    components: google.maps.GeocoderAddressComponent[],
    componentType: string,
  ): string {
    const component = components.find((item) => item.types.includes(componentType));
    return `${component?.long_name ?? ''}`.trim();
  }

  private getFirstAddressSegment(formattedAddress?: string | null): string {
    if (!formattedAddress) {
      return '';
    }

    return formattedAddress.split(',')[0]?.trim() ?? '';
  }

  private setStationSuggestions(index: number, suggestions: StationAddressSuggestion[]): void {
    const currentSuggestions = this.stationSuggestions();

    if (suggestions.length === 0) {
      const { [index]: _removed, ...rest } = currentSuggestions;
      this.stationSuggestions.set(rest);
      if (this.activeSuggestionIndex === index) {
        this.activeSuggestionIndex = null;
      }
      return;
    }

    this.stationSuggestions.set({
      ...currentSuggestions,
      [index]: suggestions,
    });
    this.activeSuggestionIndex = index;
  }

  private clearAllStationSuggestions(): void {
    this.stationSuggestions.set({});
    this.pendingAutocompleteRequests.clear();
    this.activeSuggestionIndex = null;
  }

  private clearHideSuggestionsTimeout(): void {
    if (this.hideSuggestionsTimeout != null) {
      window.clearTimeout(this.hideSuggestionsTimeout);
      this.hideSuggestionsTimeout = null;
    }
  }

  private duplicateStationsValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!(control instanceof FormArray)) {
        return null;
      }

      const seenStations = new Set<string>();

      for (const stationControl of control.controls) {
        const street = this.normalizeAddressField(stationControl.get('street')?.value);
        const number = this.normalizeAddressField(stationControl.get('number')?.value);
        const cityArea = this.normalizeAddressField(stationControl.get('cityArea')?.value);
        const postalCode = this.normalizeAddressField(stationControl.get('postalCode')?.value);

        if (!street || !number || !cityArea || !postalCode) {
          continue;
        }

        const stationKey = `${street}|${number}|${cityArea}|${postalCode}`;
        if (seenStations.has(stationKey)) {
          return { duplicateStationAddress: true };
        }

        seenStations.add(stationKey);
      }

      return null;
    };
  }

  private normalizeAddressField(value: unknown): string {
    return `${value ?? ''}`.trim().replace(/\s+/g, ' ').toLowerCase();
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

  private isTrafficTimeMode(value: string): value is TrafficTimeMode {
    return value === 'none' || value === 'departure' || value === 'arrival';
  }

  private normalizeTrafficDateTime(mode: TrafficTimeMode, value: string): string | null {
    if (mode === 'none' || value.length === 0) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return value;
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
