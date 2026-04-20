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
import { AuthenticationService } from '../../auth.service';
import { stationsFormCrossValidator } from './stationsFormCrossValidator';

type JourneyStationForm = FormGroup;
type StationAddressSuggestion = {
  placeId: string;
  description: string;
};
type RoutePreferenceOption = {
  id: number;
  code: string;
  icon: string;
  translationField: string;
  prompt: string;
};
type UserPresetOption = {
  id: number;
  street: string;
  number: string;
  cityArea: string;
  postalCode: string;
  iconData: string;
  translationField: string;
};
type StoredFilteredPreferenceResponse = {
  selectedPreferenceCode?: string | null;
  vehicleSize?: string | null;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
  trafficTimeMode?: string | null;
  trafficStartDateTime?: string | null;
  trafficEndDateTime?: string | null;
  includeEvChargingStations?: boolean;
  stations?: Array<{
    street?: string | null;
    number?: string | null;
    cityArea?: string | null;
    postalCode?: string | null;
  }>;
  hasStoredNonStationFilters?: boolean;
  hasStoredStations?: boolean;
};
type ManualStoredPreferenceResponse = {
  data?: StoredFilteredPreferenceResponse | null;
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
  readonly preferenceOptions = signal<RoutePreferenceOption[]>([]);
  readonly vehicleSizeOptions = signal<{ value: VehicleSize; translationField: string }[]>([]);
  readonly userPresets = signal<UserPresetOption[]>([]);
  readonly trafficTimeModeOptions: { value: TrafficTimeMode; translationField: string }[] = [
    { value: 'none', translationField: 'FILTER_TRAFFIC_TIME_MODE_NONE' },
    { value: 'mode', translationField: 'FILTER_TRAFFIC_TIME_MODE' },
  ];
  private autocompleteService: google.maps.places.AutocompleteService | null = null;
  private placeDetailsService: google.maps.places.PlacesService | null = null;
  private autocompleteSessionToken: google.maps.places.AutocompleteSessionToken | null = null;
  private hideSuggestionsTimeout: number | null = null;
  private readonly pendingAutocompleteRequests = new Map<number, number>();
  private readonly stationSuggestions = signal<Record<number, StationAddressSuggestion[]>>({});
  activeSuggestionIndex: number | null = null;
  confirmPopupVisible = false;
  confirmPopupMessage = '';
  private confirmPopupResolver: ((value: boolean) => void) | null = null;
  private latestStoredPreference: StoredFilteredPreferenceResponse | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private translate: TranslateService,
    private dataService: DataService,
    private auth: AuthenticationService,
  ) {
    this.stationForms = this.formBuilder.group(
      {
        stations: this.formBuilder.array([] as JourneyStationForm[], {
          validators: [this.duplicateStationsValidator()],
        }),
        preferenceCode: ['fast'],
        vehicleSize: [''],
        avoidTolls: [false],
        avoidHighways: [false],
        avoidFerries: [false],
        trafficTimeMode: ['none'],
        trafficStartDateTime: [''],
        trafficEndDateTime: [''],
        includeEvChargingStations: [false],
      },
      {
        validators: stationsFormCrossValidator('trafficStartDateTime', 'trafficEndDateTime'),
      },
    );
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
    this.loadPreferenceOptions();
    this.loadVehicleOptions();
    this.loadUserPresets();
    this.initializeAutocompleteServices();
    this.initializeFormFromNavigationState();

    if (!this.navigationService.hasShownStoredPreferencePrompt()) {
      this.navigationService.markStoredPreferencePromptAsShown();
      this.loadStoredFilteredPreferencesForCurrentUser();
      return;
    }

    this.preloadLatestStoredPreference();
  }

  reopenStoredPreferencePrompts(): void {
    if (this.latestStoredPreference) {
      void this.presentStoredPreferencePrompts(this.latestStoredPreference, true);
      return;
    }

    this.loadStoredFilteredPreferencesForCurrentUser(true);
  }

  ngOnDestroy(): void {
    this.clearHideSuggestionsTimeout();
    this.resolveConfirmation(false);
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

  async confirmRemoveStation(index: number): Promise<void> {
    if (index < 0 || index >= this.stations.length) {
      return;
    }

    const message = this.translate.instant('FILTER_REMOVE_STATION_CONFIRM', {
      station: index + 1,
    });

    if (await this.requestConfirmation(message)) {
      this.removeStation(index);
    }
  }

  async removeAllStations(): Promise<void> {
    if (this.stations.length === 0) {
      return;
    }

    const message = this.translate.instant('FILTER_REMOVE_ALL_STATIONS_CONFIRM', {
      count: this.stations.length,
    });

    if (await this.requestConfirmation(message)) {
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

    const filters = this.stations.controls.map((stationControl) => {
      const raw = stationControl.getRawValue();
      return {
        street: `${raw?.street ?? ''}`.trim(),
        number: `${raw?.number ?? ''}`.trim(),
        cityArea: `${raw?.cityArea ?? ''}`.trim(),
        postalCode: `${raw?.postalCode ?? ''}`.trim(),
      } as JourneyFilterStation;
    });
    const vehicleSizeRaw = `${this.stationForms.get('vehicleSize')?.value ?? ''}`.trim();
    const vehicleSize = this.isVehicleSize(vehicleSizeRaw) ? vehicleSizeRaw : null;
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw)
      ? trafficTimeModeRaw
      : 'none';
    const trafficStartDateTimeRaw =
      `${this.stationForms.get('trafficStartDateTime')?.value ?? ''}`.trim();
    const trafficEndDateTimeRaw =
      `${this.stationForms.get('trafficEndDateTime')?.value ?? ''}`.trim();
    const routeFilters: JourneyRouteFilters = {
      avoidTolls: !!this.stationForms.get('avoidTolls')?.value,
      avoidHighways: !!this.stationForms.get('avoidHighways')?.value,
      avoidFerries: !!this.stationForms.get('avoidFerries')?.value,
      trafficTimeMode,
      trafficStartDateTime: this.normalizeTrafficDateTime(trafficTimeMode, trafficStartDateTimeRaw),
      trafficEndDateTime: this.normalizeTrafficDateTime(trafficTimeMode, trafficEndDateTimeRaw),
      includeEvChargingStations: !!this.stationForms.get('includeEvChargingStations')?.value,
    };
    const preferenceCodeRaw = `${this.stationForms.get('preferenceCode')?.value ?? ''}`
      .trim()
      .toLowerCase();
    const selectedPreferenceCode = preferenceCodeRaw.length > 0 ? preferenceCodeRaw : 'fast';
    const selectedPreferenceOption = this.preferenceOptions().find(
      (option) => option.code === selectedPreferenceCode,
    );
    const selectedPreferencePrompt = (
      selectedPreferenceOption?.prompt || 'Find the fastest possible driving route.'
    ).trim();

    this.navigationService.setJourneyFilters(filters);
    this.navigationService.setVehicleSize(vehicleSize);
    this.navigationService.setJourneyRouteFilters(routeFilters);
    this.navigationService.setHomeDraft({
      selectedChip: selectedPreferenceCode,
      selectedChipPrompt: selectedPreferencePrompt,
    });
    this.persistFilteredPreference(
      filters,
      routeFilters,
      vehicleSize,
      selectedPreferenceCode,
      selectedPreferencePrompt,
    );

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
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw)
      ? trafficTimeModeRaw
      : 'none';

    if (trafficTimeMode === 'none') {
      this.stationForms.patchValue({
        trafficStartDateTime: '',
        trafficEndDateTime: '',
      });
    }
  }

  shouldShowTrafficDateTime(): boolean {
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw)
      ? trafficTimeModeRaw
      : 'none';
    return trafficTimeMode !== 'none';
  }

  hasNonDefaultNonStationFilters(): boolean {
    const preferenceCode = `${this.stationForms.get('preferenceCode')?.value ?? ''}`
      .trim()
      .toLowerCase();
    const vehicleSizeRaw = `${this.stationForms.get('vehicleSize')?.value ?? ''}`.trim();
    const avoidTolls = !!this.stationForms.get('avoidTolls')?.value;
    const avoidHighways = !!this.stationForms.get('avoidHighways')?.value;
    const avoidFerries = !!this.stationForms.get('avoidFerries')?.value;
    const includeEvChargingStations = !!this.stationForms.get('includeEvChargingStations')?.value;
    const trafficTimeModeRaw = `${this.stationForms.get('trafficTimeMode')?.value ?? ''}`.trim();
    const trafficTimeMode = this.isTrafficTimeMode(trafficTimeModeRaw)
      ? trafficTimeModeRaw
      : 'none';
    const trafficStartDateTime =
      `${this.stationForms.get('trafficStartDateTime')?.value ?? ''}`.trim();
    const trafficEndDateTime = `${this.stationForms.get('trafficEndDateTime')?.value ?? ''}`.trim();

    return (
      (preferenceCode.length > 0 && preferenceCode !== 'fast') ||
      vehicleSizeRaw.length > 0 ||
      avoidTolls ||
      avoidHighways ||
      avoidFerries ||
      includeEvChargingStations ||
      trafficTimeMode !== 'none' ||
      trafficStartDateTime.length > 0 ||
      trafficEndDateTime.length > 0
    );
  }

  async resetNonStationFilters(): Promise<void> {
    const message = this.translate.instant('FILTER_RESET_NON_STATION_FILTERS_CONFIRM');

    if (!(await this.requestConfirmation(message))) {
      return;
    }

    this.stationForms.patchValue({
      preferenceCode: 'fast',
      vehicleSize: '',
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: false,
      trafficTimeMode: 'none',
      trafficStartDateTime: '',
      trafficEndDateTime: '',
      includeEvChargingStations: false,
    });
    this.stationForms.markAsDirty();
  }

  onConfirmPopupAnswer(answer: boolean): void {
    this.resolveConfirmation(answer);
  }

  selectPreference(code: string): void {
    this.stationForms.patchValue({ preferenceCode: code });
    this.stationForms.markAsDirty();
  }

  isPreferenceSelected(code: string): boolean {
    const selectedCode = `${this.stationForms.get('preferenceCode')?.value ?? ''}`
      .trim()
      .toLowerCase();
    return selectedCode === code;
  }

  onStationPresetChange(index: number): void {
    const stationGroup = this.getStationGroup(index);
    if (!stationGroup) {
      return;
    }

    const selectedPresetId = this.toPositiveInt(stationGroup.get('presetId')?.value);
    if (!selectedPresetId) {
      return;
    }

    const selectedPreset = this.userPresets().find((preset) => preset.id === selectedPresetId);
    if (!selectedPreset) {
      return;
    }

    stationGroup.patchValue({
      street: selectedPreset.street,
      number: selectedPreset.number,
      cityArea: selectedPreset.cityArea,
      postalCode: selectedPreset.postalCode,
    });
    stationGroup.markAsDirty();
    stationGroup.markAllAsTouched();

    this.setStationSuggestions(index, []);
  }

  getUserPresetOptionLabel(preset: UserPresetOption): string {
    const translationField = `${preset.translationField ?? ''}`.trim();
    const translated = translationField ? this.translate.instant(translationField) : '';
    const translatedLabel = translated && translated !== translationField ? translated : translationField;
    const address = [preset.street, preset.number, preset.cityArea, preset.postalCode]
      .filter((value) => value.length > 0)
      .join(', ');

    const left = translatedLabel;
    if (!left) {
      return address;
    }

    if (!address) {
      return left;
    }

    return `${left} - ${address}`;
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
      presetId: [null],
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

  private toPositiveInt(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
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
    return value === 'none' || value === 'mode';
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

  private loadPreferenceOptions(): void {
    this.dataService.getPreferences({}).subscribe({
      next: (response: any) => {
        const mappedPreferences: RoutePreferenceOption[] = (response?.data ?? [])
          .map((item: any) => {
            const id = Number(item?.id ?? item?.Id);
            const code = `${item?.code ?? item?.Code ?? ''}`.trim().toLowerCase();
            const prompt = `${item?.prompt ?? item?.Prompt ?? ''}`.trim();
            const icon = `${item?.icon ?? item?.Icon ?? ''}`.trim();
            const translationField =
              `${item?.translationField ?? item?.TranslationField ?? ''}`.trim();

            if (!Number.isInteger(id) || id <= 0 || code.length === 0) {
              return null;
            }

            return {
              id,
              code,
              icon,
              translationField,
              prompt,
            };
          })
          .filter(
            (value: RoutePreferenceOption | null): value is RoutePreferenceOption => value != null,
          );

        this.preferenceOptions.set(mappedPreferences);

        const currentCode = `${this.stationForms.get('preferenceCode')?.value ?? ''}`
          .trim()
          .toLowerCase();
        const currentExists = mappedPreferences.some(
          (option: RoutePreferenceOption) => option.code === currentCode,
        );

        if (!currentExists) {
          const fallback =
            mappedPreferences.find((option: RoutePreferenceOption) => option.code === 'fast') ??
            mappedPreferences[0];
          this.stationForms.patchValue({ preferenceCode: fallback?.code ?? 'fast' });
        }
      },
      error: () => {
        this.preferenceOptions.set([]);

        const currentCode = `${this.stationForms.get('preferenceCode')?.value ?? ''}`
          .trim()
          .toLowerCase();
        if (currentCode.length === 0) {
          this.stationForms.patchValue({ preferenceCode: 'fast' });
        }
      },
    });
  }

  private persistFilteredPreference(
    filters: JourneyFilterStation[],
    routeFilters: JourneyRouteFilters,
    vehicleSize: VehicleSize | null,
    selectedPreferenceCode: string,
    selectedPreferencePrompt: string,
  ): void {
    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    const payload = {
      userID: userId,
      selectedPreferenceCode,
      selectedPreferencePrompt,
      vehicleSize: vehicleSize ?? null,
      avoidTolls: routeFilters.avoidTolls,
      avoidHighways: routeFilters.avoidHighways,
      avoidFerries: routeFilters.avoidFerries,
      trafficTimeMode: routeFilters.trafficTimeMode,
      trafficStartDateTime: routeFilters.trafficStartDateTime,
      trafficEndDateTime: routeFilters.trafficEndDateTime,
      includeEvChargingStations: routeFilters.includeEvChargingStations,
      stations: filters.map((station) => ({
        street: station.street,
        number: station.number,
        cityArea: station.cityArea,
        postalCode: station.postalCode,
      })),
    };

    this.dataService.filteredPreferenceCreate(payload).subscribe({
      next: (response) => {
        console.log('Successfully created preference:', response);
      },
      error: (error) => {
        console.error('Failed to create preference:', error);
      },
    });
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

  private loadUserPresets(): void {
    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.userPresets.set([]);
      return;
    }

    this.dataService.getPresetsByUser({ userId }).subscribe({
      next: (response: any) => {
        const presets = (response?.data ?? [])
          .map((item: any) => {
            const id = Number(item?.id ?? item?.Id);
            if (!Number.isInteger(id) || id <= 0) {
              return null;
            }

            const mappedPreset: UserPresetOption = {
              id,
              street: `${item?.street ?? item?.Street ?? ''}`.trim(),
              number: `${item?.number ?? item?.Number ?? ''}`.trim(),
              cityArea: `${item?.cityArea ?? item?.CityArea ?? ''}`.trim(),
              postalCode: `${item?.postalCode ?? item?.PostalCode ?? ''}`.trim(),
              iconData: `${item?.iconData ?? item?.IconData ?? ''}`.trim(),
              translationField: `${item?.translationField ?? item?.TranslationField ?? ''}`.trim(),
            };

            if (!this.hasAnyAddressField(mappedPreset)) {
              return null;
            }

            return mappedPreset;
          })
          .filter((value: UserPresetOption | null): value is UserPresetOption => value != null);

        this.userPresets.set(presets);
      },
      error: () => {
        this.userPresets.set([]);
      },
    });
  }

  private loadStoredFilteredPreferencesForCurrentUser(forceFiltersPrompt = false): void {
    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    this.dataService.filteredPreferenceGetLatestByUser({ userId }).subscribe({
      next: async (response: any) => {
        const stored = (response?.data ?? null) as StoredFilteredPreferenceResponse | null;
        if (!stored) {
          this.latestStoredPreference = null;
          return;
        }

        this.latestStoredPreference = stored;
        await this.presentStoredPreferencePrompts(stored, forceFiltersPrompt);
      },
      error: () => {
        // Keep current filter state if loading saved preferences fails.
      },
    });
  }

  private preloadLatestStoredPreference(): void {
    const userId = Number(this.auth.currentUser()?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.latestStoredPreference = null;
      return;
    }

    this.dataService.filteredPreferenceGetLatestByUser({ userId }).subscribe({
      next: (response: ManualStoredPreferenceResponse) => {
        const stored = (response?.data ?? null) as StoredFilteredPreferenceResponse | null;
        this.latestStoredPreference = stored;
      },
      error: () => {
        this.latestStoredPreference = null;
      },
    });
  }

  private async presentStoredPreferencePrompts(
    stored: StoredFilteredPreferenceResponse,
    forceFiltersPrompt: boolean,
  ): Promise<void> {
    const shouldAskForFilters = forceFiltersPrompt || !!stored.hasStoredNonStationFilters;
    if (shouldAskForFilters) {
      const applyStoredFilters = await this.requestConfirmation(
        this.translate.instant('FILTER_STORED_FILTERS_CONFIRM'),
      );
      if (applyStoredFilters) {
        this.applyStoredNonStationFilters(stored);
      }
    }

    const stations = this.normalizeStoredStations(stored.stations);
    if (!stations.length) {
      return;
    }

    const applyStoredStations = await this.requestConfirmation(
      this.translate.instant('FILTER_STORED_STATIONS_CONFIRM'),
    );
    if (applyStoredStations) {
      this.applyStoredStations(stations);
    }
  }

  private applyStoredNonStationFilters(stored: StoredFilteredPreferenceResponse): void {
    const selectedPreferenceCode = `${stored.selectedPreferenceCode ?? ''}`.trim().toLowerCase();
    const normalizedTrafficMode = `${stored.trafficTimeMode ?? ''}`.trim().toLowerCase();
    const trafficTimeMode = this.isTrafficTimeMode(normalizedTrafficMode)
      ? normalizedTrafficMode
      : 'none';

    this.stationForms.patchValue({
      preferenceCode: selectedPreferenceCode.length > 0 ? selectedPreferenceCode : 'fast',
      vehicleSize: this.isVehicleSize(`${stored.vehicleSize ?? ''}`.trim())
        ? `${stored.vehicleSize}`.trim()
        : '',
      avoidTolls: !!stored.avoidTolls,
      avoidHighways: !!stored.avoidHighways,
      avoidFerries: !!stored.avoidFerries,
      trafficTimeMode,
      trafficStartDateTime: this.toDateTimeLocalValue(stored.trafficStartDateTime),
      trafficEndDateTime: this.toDateTimeLocalValue(stored.trafficEndDateTime),
      includeEvChargingStations: !!stored.includeEvChargingStations,
    });
  }

  private applyStoredStations(stations: JourneyFilterStation[]): void {
    this.stations.clear();
    stations.forEach((station) => this.stations.push(this.createStationGroup(station)));
    this.clearAllStationSuggestions();
  }

  private normalizeStoredStations(
    stations: StoredFilteredPreferenceResponse['stations'],
  ): JourneyFilterStation[] {
    return (stations ?? [])
      .map((station) => ({
        street: `${station?.street ?? ''}`.trim(),
        number: `${station?.number ?? ''}`.trim(),
        cityArea: `${station?.cityArea ?? ''}`.trim(),
        postalCode: `${station?.postalCode ?? ''}`.trim(),
      }))
      .filter((station) => this.hasAnyAddressField(station));
  }

  private initializeFormFromNavigationState(): void {
    const existingStations = this.navigationService.getJourneyFiltersSnapshot();
    const existingVehicleSize = this.navigationService.getVehicleSizeSnapshot();
    const existingRouteFilters = this.navigationService.getJourneyRouteFiltersSnapshot();
    const existingHomeDraft = this.navigationService.getHomeDraftSnapshot();
    const trafficTimeMode = existingRouteFilters.trafficTimeMode === 'none' ? 'none' : 'mode';

    this.stations.clear();
    this.clearAllStationSuggestions();
    this.stationForms.patchValue({
      preferenceCode: `${existingHomeDraft.selectedChip ?? 'fast'}`.trim().toLowerCase(),
      vehicleSize: existingVehicleSize ?? '',
      avoidTolls: existingRouteFilters.avoidTolls,
      avoidHighways: existingRouteFilters.avoidHighways,
      avoidFerries: existingRouteFilters.avoidFerries,
      trafficTimeMode,
      trafficStartDateTime: this.toDateTimeLocalValue(existingRouteFilters.trafficStartDateTime),
      trafficEndDateTime: this.toDateTimeLocalValue(existingRouteFilters.trafficEndDateTime),
      includeEvChargingStations: existingRouteFilters.includeEvChargingStations,
    });
    existingStations.forEach((filter) => this.stations.push(this.createStationGroup(filter)));
    this.stationForms.markAsPristine();
    this.stationForms.markAsUntouched();
  }

  private toDateTimeLocalValue(value: unknown): string {
    const raw = `${value ?? ''}`.trim();
    if (!raw) {
      return '';
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const year = parsed.getFullYear();
    const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
    const day = `${parsed.getDate()}`.padStart(2, '0');
    const hours = `${parsed.getHours()}`.padStart(2, '0');
    const minutes = `${parsed.getMinutes()}`.padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private hasAnyAddressField(station: JourneyFilterStation): boolean {
    return (
      station.street.length > 0 ||
      station.number.length > 0 ||
      station.cityArea.length > 0 ||
      station.postalCode.length > 0
    );
  }

  private requestConfirmation(message: string): Promise<boolean> {
    this.resolveConfirmation(false);
    this.confirmPopupMessage = message;
    this.confirmPopupVisible = true;

    return new Promise<boolean>((resolve) => {
      this.confirmPopupResolver = resolve;
    });
  }

  private resolveConfirmation(answer: boolean): void {
    if (!this.confirmPopupResolver) {
      this.confirmPopupVisible = false;
      this.confirmPopupMessage = '';
      return;
    }

    const resolver = this.confirmPopupResolver;
    this.confirmPopupResolver = null;
    this.confirmPopupVisible = false;
    this.confirmPopupMessage = '';
    resolver(answer);
  }
}
