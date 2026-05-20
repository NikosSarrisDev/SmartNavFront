import {
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  effect,
  signal,
} from '@angular/core';
import {
  JourneyRouteFilters,
  NavigationService,
  PoiIntent,
  VehicleSize,
} from '../../navigation.service';
import { AsyncPipe, DatePipe, DecimalPipe, NgFor, NgIf, NgClass } from '@angular/common';
import { GoogleMap, GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Toast } from 'primeng/toast';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { UiSettingsService } from '../../ui-settings.service';

type RouteFeatureMarkerType = 'toll' | 'highway' | 'ferry' | 'ev';
type RouteFeatureMarker = {
  id: string;
  position: google.maps.LatLngLiteral;
  title: string;
  options: google.maps.MarkerOptions;
};
type RouteChoiceOption = {
  routeIndex: number;
  title: string;
  summary: string;
  distanceKm: number;
  durationMin: number;
  isRecommended: boolean;
};
type StationAddressSuggestion = {
  placeId: string;
  description: string;
};
type PresetIconOption = {
  id: number;
  iconData: string;
  translationField: string;
  safeIconSvg: SafeHtml | null;
};
type FastPresetFormState = {
  street: string;
  number: string;
  cityArea: string;
  postalCode: string;
  presetIconId: number | null;
};
type ParsedAddress = {
  street: string;
  number: string;
  cityArea: string;
  postalCode: string;
};
type RoutePreferenceLookupItem = {
  code: string;
  prompt: string;
  translationField: string;
};
type PoiPlaceCard = {
  id: string;
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  userRatingsTotal: number;
  photoUrl: string | null;
  category: string;
  position: google.maps.LatLngLiteral;
  distanceFromRouteMeters: number;
};
type UserPresetMapMarker = {
  id: string;
  position: google.maps.LatLngLiteral;
  title: string;
  options: google.maps.MarkerOptions;
};

@Component({
  selector: 'app-home',
  imports: [
    GoogleMapsModule,
    AsyncPipe,
    NgIf,
    NgFor,
    DatePipe,
    DecimalPipe,
    TranslatePipe,
    NgClass,
    FormsModule,
    ProgressSpinnerModule,
    Toast,
  ],
  templateUrl: './home.html',
  styleUrl: './home.css',
  providers: [MessageService],
})
export class Home implements OnInit, OnDestroy {
  @ViewChild(GoogleMap) mapRef?: GoogleMap;

  currentUserId!: any;
  currentUserPreference!: any;
  selectedChip: string = '';
  selectedChipPrompt: string = '';
  selectedMoodCode: string = '';
  selectedMoodPrompt: string = '';
  currentSearchText: string = '';
  duration: string = '';
  distance: string = '';
  currentAvatar!: string;
  currentUserName!: string;
  navigationStarted: boolean = false;
  navigationStartAt: Date | null = null;
  navigationPanelVisible = false;
  navigationProgress = 0;
  totalDistanceKm = 0;
  totalDurationMinutes = 0;
  remainingDistanceKm = 0;
  remainingDurationMinutes = 0;
  navigationEta: Date | null = null;
  destinationMarker?: google.maps.LatLngLiteral;
  userStartMarker?: google.maps.LatLngLiteral;
  navigationArrow?: google.maps.LatLngLiteral;
  activeRoutePath: google.maps.LatLngLiteral[] = [];
  navigationArrowOptions: google.maps.MarkerOptions = {
    clickable: false,
    zIndex: 1000,
    optimized: false,
    icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
  };
  navigationPulseOptions: google.maps.CircleOptions = {
    strokeColor: '#1d4ed8',
    strokeOpacity: 0.95,
    strokeWeight: 2,
    fillColor: '#38bdf8',
    fillOpacity: 0.35,
    zIndex: 999,
  };
  userStartMarkerOptions: google.maps.MarkerOptions = {
    zIndex: 998,
    clickable: false,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#94a3b8',
      fillOpacity: 0.75,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 6,
    },
  };
  loadingAvatar = signal(false);
  public routeData$!: Observable<any>;
  private latestDirections?: google.maps.DirectionsResult;
  private navigationPath: google.maps.LatLngLiteral[] = [];
  private navigationPathIndex = 0;
  private navigationAnimationTimer: number | null = null;
  private cameraAnimationTimer: number | null = null;
  private antOffset = 0;

  activeRouteBaseOptions: google.maps.PolylineOptions = {
    strokeColor: '#a855f7',
    strokeOpacity: 0.95,
    strokeWeight: 8,
    zIndex: 20,
  };
  activeRouteGlowOptions: google.maps.PolylineOptions = {
    strokeColor: '#e9d5ff',
    strokeOpacity: 0.45,
    strokeWeight: 14,
    zIndex: 19,
  };
  activeRouteDashOptions: google.maps.PolylineOptions = {
    strokeOpacity: 0,
    strokeWeight: 8,
    zIndex: 21,
    icons: [],
  };

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  mapZoom = 15;
  mapOptions: google.maps.MapOptions = {
    tilt: 0,
    heading: 0,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  };
  selectedRouteDirections?: google.maps.DirectionsResult;
  route?: google.maps.DirectionsResult;
  explanation: string = '';
  routeChoiceOptions: RouteChoiceOption[] = [];
  selectedRouteIndex = 0;
  activeTripId: number | null = null;
  routeRatingValue = 0;
  routeRatingSaving = false;
  routeRatingPanelVisible = false;
  routeRatingSubmitted = false;
  readonly routeRatingStars = [1, 2, 3, 4, 5];
  readonly routeFeatureMarkers = signal<RouteFeatureMarker[]>([]);
  readonly poiMarkers = signal<RouteFeatureMarker[]>([]);
  readonly poiPlaces = signal<PoiPlaceCard[]>([]);
  readonly userPresetMarkers = signal<UserPresetMapMarker[]>([]);
  private readonly vehicleIdByCode = new Map<string, number>();
  private readonly preferencePromptByCode = new Map<string, string>();
  private readonly preferenceTranslationFieldByCode = new Map<string, string>();
  private readonly moodTranslationFieldByCode = new Map<string, string>();
  private routeFeatureRequestToken = 0;
  private selectedPoiIntents: PoiIntent[] = [];
  private hasHandledNavigationArrival = false;
  private readonly routeFeatureIconByType: Record<RouteFeatureMarkerType, string> = {
    toll: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    highway: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
    ferry: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
    ev: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
  };
  private readonly poiMarkerIcon = 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  fastPresetsModalVisible = false;
  fastPresetConfirmVisible = false;
  fastPresetSaving = false;
  fastPresetIconsLoading = false;
  readonly fastPresetIcons = signal<PresetIconOption[]>([]);
  fastPresetForm: FastPresetFormState = this.createInitialFastPresetForm();
  private fastPresetAutocompleteService: google.maps.places.AutocompleteService | null = null;
  private fastPresetPlaceDetailsService: google.maps.places.PlacesService | null = null;
  private presetPlacesService: google.maps.places.PlacesService | null = null;
  private fastPresetAutocompleteSessionToken: google.maps.places.AutocompleteSessionToken | null =
    null;
  private fastPresetAutocompleteRequestVersion = 0;
  private fastPresetHideSuggestionsTimeout: number | null = null;
  readonly fastPresetSuggestions = signal<StationAddressSuggestion[]>([]);
  fastPresetSuggestionListVisible = false;
  private hasSeenHomeDraftEffectInitialRun = false;
  private isPersistingHomeDraftLocally = false;
  private shouldShowAppliedPreferenceChip = false;
  private isMapInitialized = false;
  private presetMarkersLoading = false;

  constructor(
    public navService: NavigationService,
    private isLoaderFullCompEnabled: IsLoaderFullCompEnabled,
    private auth: AuthenticationService,
    private dataService: DataService,
    private router: Router,
    private translate: TranslateService,
    private messageService: MessageService,
    private sanitizer: DomSanitizer,
    private uiSettings: UiSettingsService,
  ) {
    effect(() => {
      this.navService.homeDraft();

      if (!this.hasSeenHomeDraftEffectInitialRun) {
        this.hasSeenHomeDraftEffectInitialRun = true;
        return;
      }

      if (this.isPersistingHomeDraftLocally) {
        return;
      }

      this.shouldShowAppliedPreferenceChip = true;
    });

    effect(() => {
      const currentSettings = this.uiSettings.settings();
      this.applyMapSettings(currentSettings.mapStyle, currentSettings.theme);
    });
  }

  async ngOnInit() {
    this.loadingAvatar.set(true);
    const currentUser = this.auth.currentUser();
    this.currentUserId = currentUser?.data?.id;
    this.currentUserName = currentUser?.data?.userName;
    const homeDraft = this.navService.getHomeDraftSnapshot();
    this.currentSearchText = homeDraft.searchText;
    this.selectedChip = this.normalizePreferenceCode(homeDraft.selectedChip);
    this.selectedChipPrompt = `${homeDraft.selectedChipPrompt ?? ''}`.trim();
    this.selectedMoodCode = `${homeDraft.selectedMoodCode ?? ''}`.trim().toLowerCase();
    this.selectedMoodPrompt = `${homeDraft.selectedMoodPrompt ?? ''}`.trim();

    try {
      this.center = await this.navService.getCurrentLocation();
    } catch {
      // Keep the current center fallback and rely on errorMessage$ for UI feedback.
    }
    this.getCurrentUserRoleAndAvatar(this.currentUserId);
    this.getActivePreference(this.currentUserId);
    this.loadVehicleLookup();
    this.loadPreferenceLookup();
    this.loadMoodLookup();
    this.loadUserPresetMarkers();
    this.initializeFastPresetAutocompleteServices();
  }

  getCurrentUserRoleAndAvatar(userId: number) {
    this.dataService
      .getCurrentUserRoleAndAvatar({ userId })
      .pipe(finalize(() => this.loadingAvatar.set(false)))
      .subscribe({
        next: (response: any) => {
          this.loadingAvatar.set(false);
          this.currentAvatar = response.data.avatarURL;
        },
        error: (err) => console.error('Avatar Load Failed', err),
      });
  }

  navigateToUserDashboard() {
    this.router.navigate(['/user']);
  }

  onMapInitialized(_map: google.maps.Map): void {
    this.isMapInitialized = true;
    this.presetPlacesService = new google.maps.places.PlacesService(_map);
    void this.loadUserPresetMarkers();
  }

  onSearchTextChange(value: string): void {
    this.currentSearchText = value;
    this.persistHomeDraft();
  }

  getActivePreference(userId: number) {
    this.dataService.getCurrentUserActivePreference({ userId }).subscribe(
      (response) => {
        this.currentUserPreference = response?.data?.[0]?.code ?? null;
      },
      () => {
        this.currentUserPreference = null;
      },
    );
  }

  async findPath() {
    const latestDraft = this.navService.getHomeDraftSnapshot();
    this.selectedChip = this.normalizePreferenceCode(latestDraft.selectedChip || this.selectedChip);
    this.selectedChipPrompt =
      `${latestDraft.selectedChipPrompt ?? this.selectedChipPrompt ?? ''}`.trim();
    this.selectedMoodCode = `${latestDraft.selectedMoodCode ?? this.selectedMoodCode ?? ''}`
      .trim()
      .toLowerCase();
    this.selectedMoodPrompt = `${latestDraft.selectedMoodPrompt ?? this.selectedMoodPrompt ?? ''}`.trim();
    if (!this.selectedChipPrompt && this.selectedChip) {
      this.selectedChipPrompt = this.getPreferencePromptByCode(this.selectedChip);
    }

    const trimmedQuery = (this.currentSearchText || '').trim();
    if (!trimmedQuery) {
      this.navService.errorMessage$.next('Please fill in the destination details first.');
      return;
    }

    this.isLoaderFullCompEnabled.setLoadingToTrue();

    let latestPosition: google.maps.LatLngLiteral;
    latestPosition = this.center;
    try {
      const freshPosition = await this.navService.getCurrentLocation();
      latestPosition = freshPosition;
      this.center = latestPosition;
    } catch {
      // Keep current center as fallback so one click still runs the route search.
    }

    this.currentSearchText = trimmedQuery;
    this.persistHomeDraft();
    this.explanation = '';
    this.navigationStarted = false;
    this.navigationStartAt = null;
    this.navigationPanelVisible = false;
    this.navigationProgress = 0;
    this.totalDistanceKm = 0;
    this.totalDurationMinutes = 0;
    this.remainingDistanceKm = 0;
    this.remainingDurationMinutes = 0;
    this.navigationEta = null;
    this.destinationMarker = undefined;
    this.userStartMarker = undefined;
    this.activeRoutePath = [];
    this.latestDirections = undefined;
    this.selectedRouteDirections = undefined;
    this.routeChoiceOptions = [];
    this.selectedRouteIndex = 0;
    this.activeTripId = null;
    this.routeRatingValue = 0;
    this.routeRatingSaving = false;
    this.routeRatingPanelVisible = false;
    this.routeRatingSubmitted = false;
    this.hasHandledNavigationArrival = false;
    this.routeFeatureRequestToken++;
    this.routeFeatureMarkers.set([]);
    this.poiMarkers.set([]);
    this.poiPlaces.set([]);
    this.selectedPoiIntents = [];
    this.stopNavigationSimulation();
    this.resetMapToClassicView();

    const navigationPrompt = this.buildNavigationPrompt();
    const geminiPrompt = navigationPrompt
      ? `${navigationPrompt}. User request: "${trimmedQuery}"`
      : `User request: "${trimmedQuery}"`;

    this.routeData$ = this.navService.getSmartRoute(geminiPrompt, latestPosition).pipe(
      tap((data) => {
        if (data && data.explanation) {
          this.latestDirections = data.result;
          const showReason = this.uiSettings.settings().alwaysShowRouteExplanation;
          this.explanation = showReason ? data.explanation : '';
          this.selectedPoiIntents = data.poiIntents ?? [];
          this.buildRouteChoiceOptions(data.result);
          this.selectRouteChoice(0);
        }
      }),
      finalize(() => this.isLoaderFullCompEnabled.setLoadingToFalse()),
    );
  }

  startNavigation() {
    if (!this.latestDirections || !this.latestDirections.routes?.length) {
      this.navService.errorMessage$.next('Find a route first and then start navigation.');
      return;
    }

    const selectedRoute =
      this.latestDirections.routes[this.selectedRouteIndex] ?? this.latestDirections.routes[0];
    if (!selectedRoute.legs?.length) {
      this.navService.errorMessage$.next('No route legs were found.');
      return;
    }

    const firstLeg = selectedRoute.legs[0];
    const lastLeg = selectedRoute.legs[selectedRoute.legs.length - 1];
    const totalDistanceMeters = selectedRoute.legs.reduce(
      (sum, leg) => sum + (leg.distance?.value ?? 0),
      0,
    );
    const totalDurationSeconds = selectedRoute.legs.reduce(
      (sum, leg) => sum + (leg.duration?.value ?? 0),
      0,
    );
    const totalDistanceKm = totalDistanceMeters / 1000;
    const savedStations = this.navService.getJourneyFiltersSnapshot();
    const selectedVehicleCode = this.navService.getVehicleSizeSnapshot();
    const selectedVehicleId = selectedVehicleCode
      ? (this.vehicleIdByCode.get(selectedVehicleCode) ?? null)
      : null;

    const payload = {
      userID: this.currentUserId,
      destination: lastLeg.end_address,
      departure: firstLeg.start_address,
      distanceKM: Number(totalDistanceKm.toFixed(2)),
      score: null,
      tripDate: new Date().toISOString(),
      vehicleID: selectedVehicleId,
      vehicleCode: selectedVehicleCode ?? null,
      stations: savedStations.map((station, index) => ({
        street: station.street,
        number: station.number,
        cityArea: station.cityArea,
        postalCode: station.postalCode,
        position: index + 1,
      })),
    };

    this.dataService.tripCreate(payload).subscribe({
      next: (response: any) => {
        this.activeTripId = this.resolveActiveTripId(response);
        this.routeRatingValue = 0;
        this.routeRatingSaving = false;
        this.routeRatingPanelVisible = false;
        this.routeRatingSubmitted = false;
        this.hasHandledNavigationArrival = false;
        this.navigationStarted = true;
        this.navigationStartAt = new Date();
        this.navigationPanelVisible = true;
        this.totalDistanceKm = Number(totalDistanceKm.toFixed(2));
        this.totalDurationMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));
        this.remainingDistanceKm = this.totalDistanceKm;
        this.remainingDurationMinutes = this.totalDurationMinutes;
        this.navigationProgress = 0;
        this.navigationEta = new Date(Date.now() + this.totalDurationMinutes * 60000);
        this.activeRoutePath = this.buildNavigationPath(selectedRoute);
        this.antOffset = 0;
        this.updateAntPathStyle();
        const destinationMarker = this.toLatLngLiteral(lastLeg.end_location);
        const startMarker = this.toLatLngLiteral(firstLeg.start_location);
        this.destinationMarker =
          destinationMarker ?? this.activeRoutePath[this.activeRoutePath.length - 1] ?? undefined;
        this.userStartMarker = startMarker ?? this.activeRoutePath[0] ?? undefined;
        this.enableNavigationView(selectedRoute);
        this.navService.errorMessage$.next(null);
      },
      error: () => {
        this.navService.errorMessage$.next('Navigation could not be started. Please try again.');
      },
    });
  }

  cancelNavigation() {
    if (this.routeRatingSaving) {
      return;
    }

    this.navigationStarted = false;
    this.navigationStartAt = null;
    this.navigationPanelVisible = false;
    this.navigationProgress = 0;
    this.totalDistanceKm = 0;
    this.totalDurationMinutes = 0;
    this.remainingDistanceKm = 0;
    this.remainingDurationMinutes = 0;
    this.navigationEta = null;
    this.userStartMarker = undefined;
    this.activeRoutePath = [];
    this.activeTripId = null;
    this.hasHandledNavigationArrival = false;
    this.routeRatingValue = 0;
    this.routeRatingSaving = false;
    this.routeRatingPanelVisible = false;
    this.routeRatingSubmitted = false;
    this.stopNavigationSimulation();
    this.resetMapToClassicView();
    this.poiPlaces.set([]);
    this.poiMarkers.set([]);
    this.selectedPoiIntents = [];
  }

  canStartNavigation(): boolean {
    return !!this.latestDirections?.routes?.length && this.routeChoiceOptions.length > 0;
  }

  selectRouteChoice(routeIndex: number): void {
    if (!this.latestDirections?.routes?.length) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(routeIndex, this.latestDirections.routes.length - 1));
    const selectedRoute = this.latestDirections.routes[boundedIndex];
    if (!selectedRoute?.legs?.length) {
      return;
    }

    this.selectedRouteIndex = boundedIndex;
    this.selectedRouteDirections = this.createDirectionsResultForSelectedRoute(boundedIndex);

    let totalDistance = 0;
    let totalDuration = 0;
    selectedRoute.legs.forEach((leg: any) => {
      totalDistance += leg.distance?.value ?? 0;
      totalDuration += leg.duration?.value ?? 0;
    });

    this.distance = (totalDistance / 1000).toFixed(1) + ' km';
    this.duration = Math.round(totalDuration / 60) + ' min';

    const routeFilters = this.navService.getJourneyRouteFiltersSnapshot();
    this.routeFeatureRequestToken++;
    const currentToken = this.routeFeatureRequestToken;
    void this.loadRouteFeatureMarkers(selectedRoute, routeFilters, currentToken);
    void this.loadPoiPlacesForRoute(selectedRoute, currentToken);
  }

  selectRouteRating(value: number): void {
    if (this.routeRatingSaving) {
      return;
    }

    this.routeRatingValue = Math.max(1, Math.min(5, value));
  }

  toggleRouteRatingPanel(): void {
    if (!this.navigationStarted || this.routeRatingSaving || this.routeRatingSubmitted) {
      return;
    }

    this.routeRatingPanelVisible = !this.routeRatingPanelVisible;
  }

  submitRouteRating(): void {
    if (this.routeRatingSaving) {
      return;
    }

    if (this.routeRatingValue < 1 || this.routeRatingValue > 5) {
      return;
    }

    const userId = Number(this.currentUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return;
    }

    this.routeRatingSaving = true;
    this.dataService
      .tripRate({
        userId,
        tripId: this.activeTripId,
        score: this.routeRatingValue,
      })
      .subscribe({
        next: () => {
          this.routeRatingSaving = false;
          this.routeRatingSubmitted = true;
          this.routeRatingPanelVisible = false;
          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('HOME_ROUTE_RATING_SUCCESS_TITLE'),
            detail: this.translate.instant('HOME_ROUTE_RATING_SUCCESS_MESSAGE'),
          });
        },
        error: () => {
          this.routeRatingSaving = false;
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('HOME_ROUTE_RATING_ERROR_TITLE'),
            detail: this.translate.instant('HOME_ROUTE_RATING_ERROR_MESSAGE'),
          });
        },
      });
  }

  openFastPresetsModal(): void {
    this.fastPresetsModalVisible = true;
    this.fastPresetConfirmVisible = false;
    this.loadFastPresetIcons();
    this.initializeFastPresetAutocompleteServices();
  }

  closeFastPresetsModal(): void {
    if (this.fastPresetSaving) {
      return;
    }

    this.fastPresetsModalVisible = false;
    this.fastPresetConfirmVisible = false;
    this.fastPresetForm = this.createInitialFastPresetForm();
    this.fastPresetSuggestions.set([]);
    this.fastPresetSuggestionListVisible = false;
    this.fastPresetAutocompleteSessionToken = null;
    this.clearFastPresetHideSuggestionsTimeout();
  }

  onFastPresetOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeFastPresetsModal();
    }
  }

  onFastPresetStreetInput(): void {
    this.clearFastPresetHideSuggestionsTimeout();

    const streetValue = `${this.fastPresetForm.street ?? ''}`.trim();
    if (!streetValue || !this.fastPresetAutocompleteService) {
      this.fastPresetSuggestions.set([]);
      this.fastPresetSuggestionListVisible = false;
      return;
    }

    this.fastPresetAutocompleteRequestVersion++;
    const requestVersion = this.fastPresetAutocompleteRequestVersion;
    const request: google.maps.places.AutocompletionRequest = {
      input: this.buildFastPresetAutocompleteQuery(),
      sessionToken: this.getFastPresetAutocompleteSessionToken(),
      types: ['address'],
      componentRestrictions: { country: 'gr' },
      language: 'el',
      region: 'gr',
    };

    this.fastPresetAutocompleteService.getPlacePredictions(request, (predictions, status) => {
      if (this.fastPresetAutocompleteRequestVersion !== requestVersion) {
        return;
      }

      if (
        status !== google.maps.places.PlacesServiceStatus.OK ||
        !predictions ||
        predictions.length === 0
      ) {
        this.fastPresetSuggestions.set([]);
        this.fastPresetSuggestionListVisible = false;
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

      this.fastPresetSuggestions.set(nextSuggestions);
      this.fastPresetSuggestionListVisible = nextSuggestions.length > 0;
    });
  }

  onFastPresetStreetFocus(): void {
    this.clearFastPresetHideSuggestionsTimeout();
    if (this.fastPresetSuggestions().length > 0) {
      this.fastPresetSuggestionListVisible = true;
    }
  }

  onFastPresetStreetBlur(): void {
    this.clearFastPresetHideSuggestionsTimeout();
    this.fastPresetHideSuggestionsTimeout = window.setTimeout(() => {
      this.fastPresetSuggestionListVisible = false;
    }, 120);
  }

  selectFastPresetSuggestion(suggestion: StationAddressSuggestion, event: MouseEvent): void {
    event.preventDefault();
    this.clearFastPresetHideSuggestionsTimeout();

    if (!this.fastPresetPlaceDetailsService) {
      this.fastPresetSuggestions.set([]);
      this.fastPresetSuggestionListVisible = false;
      return;
    }

    const request: google.maps.places.PlaceDetailsRequest = {
      placeId: suggestion.placeId,
      fields: ['address_components', 'formatted_address', 'name'],
      sessionToken: this.fastPresetAutocompleteSessionToken ?? undefined,
      language: 'el',
      region: 'gr',
    };

    this.fastPresetPlaceDetailsService.getDetails(request, (place, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        return;
      }

      const parsedAddress = this.parseAddressFromPlace(place);
      this.fastPresetForm = {
        ...this.fastPresetForm,
        street: parsedAddress.street || this.fastPresetForm.street,
        number: parsedAddress.number || this.fastPresetForm.number,
        cityArea: parsedAddress.cityArea || this.fastPresetForm.cityArea,
        postalCode: parsedAddress.postalCode || this.fastPresetForm.postalCode,
      };

      this.fastPresetAutocompleteSessionToken = null;
      this.fastPresetSuggestions.set([]);
      this.fastPresetSuggestionListVisible = false;
    });
  }

  canSaveFastPreset(): boolean {
    const selectedIconId = Number(this.fastPresetForm.presetIconId);
    const hasIcon = Number.isInteger(selectedIconId) && selectedIconId > 0;
    return hasIcon && this.hasAnyFastPresetAddressField();
  }

  onFastPresetSaveClick(): void {
    if (!this.canSaveFastPreset() || this.fastPresetSaving) {
      return;
    }

    this.fastPresetConfirmVisible = true;
  }

  onFastPresetConfirmAnswer(shouldSave: boolean): void {
    this.fastPresetConfirmVisible = false;
    if (!shouldSave) {
      return;
    }

    this.saveFastPreset();
  }

  getFastPresetIconOptionLabel(icon: PresetIconOption): string {
    const translationField = `${icon.translationField ?? ''}`.trim();
    const translated = translationField ? this.translate.instant(translationField) : '';
    return translated && translated !== translationField ? translated : translationField;
  }

  getSelectedFastPresetIconOption(): PresetIconOption | null {
    const selectedId = Number(this.fastPresetForm.presetIconId);
    if (!Number.isInteger(selectedId) || selectedId <= 0) {
      return null;
    }

    return this.fastPresetIcons().find((icon) => icon.id === selectedId) ?? null;
  }

  getSelectedFastPresetIconLabel(): string {
    const selected = this.getSelectedFastPresetIconOption();
    if (!selected) {
      return this.translate.instant('HOME_FAST_PRESETS_ICON_PLACEHOLDER');
    }

    return this.getFastPresetIconOptionLabel(selected);
  }

  getSelectedFastPresetIconSvg(): SafeHtml | null {
    return this.getSelectedFastPresetIconOption()?.safeIconSvg ?? null;
  }

  getAppliedFilterChipLabels(): string[] {
    const chips: string[] = [];
    const preferenceCode = this.getSelectedPreferenceCode();
    if (preferenceCode && this.shouldShowAppliedPreferenceChip) {
      const preferenceLabel = this.getPreferenceChipLabel(preferenceCode);
      if (preferenceLabel) {
        chips.push(preferenceLabel);
      }
    }
    const moodCode = `${this.navService.getHomeDraftSnapshot().selectedMoodCode ?? this.selectedMoodCode ?? ''}`
      .trim()
      .toLowerCase();
    if (moodCode) {
      const moodChipLabel = this.getMoodChipLabel(moodCode);
      if (moodChipLabel) {
        chips.push(moodChipLabel);
      }
    }

    const stations = this.navService.getJourneyFiltersSnapshot();
    if (stations.length > 0) {
      const stationsKey =
        stations.length === 1 ? 'HOME_ACTIVE_STATIONS_SINGLE' : 'HOME_ACTIVE_STATIONS_MULTI';
      chips.push(this.translate.instant(stationsKey, { count: stations.length }));
    }

    const vehicleSize = this.navService.getVehicleSizeSnapshot();
    const vehicleLabel = this.getVehicleSizeChipLabel(vehicleSize);
    if (vehicleLabel) {
      chips.push(vehicleLabel);
    }

    const routeFilters = this.navService.getJourneyRouteFiltersSnapshot();
    if (routeFilters.avoidTolls) {
      chips.push(this.translate.instant('HOME_FILTER_AVOID_TOLLS'));
    }
    if (routeFilters.avoidHighways) {
      chips.push(this.translate.instant('HOME_FILTER_AVOID_HIGHWAYS'));
    }
    if (routeFilters.avoidFerries) {
      chips.push(this.translate.instant('HOME_FILTER_AVOID_FERRIES'));
    }
    if (routeFilters.trafficTimeMode === 'departure') {
      chips.push(this.translate.instant('HOME_FILTER_TRAFFIC_MODE_DEPARTURE'));
    } else if (routeFilters.trafficTimeMode === 'arrival') {
      chips.push(this.translate.instant('HOME_FILTER_TRAFFIC_MODE_ARRIVAL'));
    }

    if (routeFilters.trafficStartDateTime) {
      chips.push(
        this.translate.instant('HOME_FILTER_TRAFFIC_START_AT', {
          date: this.formatAppliedFilterChipDate(routeFilters.trafficStartDateTime),
        }),
      );
    }

    if (routeFilters.trafficEndDateTime) {
      chips.push(
        this.translate.instant('HOME_FILTER_TRAFFIC_END_AT', {
          date: this.formatAppliedFilterChipDate(routeFilters.trafficEndDateTime),
        }),
      );
    }

    if (routeFilters.includeEvChargingStations) {
      chips.push(this.translate.instant('HOME_FILTER_EV_CHARGERS'));
    }

    return chips;
  }

  trackAppliedFilterChip(index: number): number {
    return index;
  }

  trackRouteChoice(_index: number, option: RouteChoiceOption): number {
    return option.routeIndex;
  }

  trackRouteFeatureMarker(_index: number, marker: RouteFeatureMarker): string {
    return marker.id;
  }

  trackPoiMarker(_index: number, marker: RouteFeatureMarker): string {
    return marker.id;
  }

  trackUserPresetMarker(_index: number, marker: UserPresetMapMarker): string {
    return marker.id;
  }

  trackPoiCard(_index: number, poi: PoiPlaceCard): string {
    return poi.id;
  }

  getPoiCategoryLabel(category: string): string {
    const normalized = `${category ?? ''}`.trim().toLowerCase();
    if (!normalized) {
      return this.translate.instant('HOME_POI_CATEGORY_GENERAL');
    }

    const key = `HOME_POI_CATEGORY_${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
    const translated = this.translate.instant(key);
    if (translated && translated !== key) {
      return translated;
    }

    return normalized;
  }

  focusPoiOnMap(poi: PoiPlaceCard): void {
    if (!poi?.position) {
      return;
    }

    this.center = { ...poi.position };
    this.mapZoom = Math.max(this.mapZoom, 16);
    const map = this.mapRef?.googleMap;
    if (map) {
      map.panTo(this.center);
      map.setZoom(this.mapZoom);
    }
  }

  ngOnDestroy(): void {
    this.persistHomeDraft();
    this.stopCameraAnimation();
    this.stopNavigationSimulation();
    this.clearFastPresetHideSuggestionsTimeout();
  }

  private enableNavigationView(route: google.maps.DirectionsRoute): void {
    this.navigationPath = this.normalizeNavigationPath(this.buildNavigationPath(route));
    this.navigationPathIndex = 0;

    if (!this.navigationPath.length) {
      return;
    }

    const startPosition = this.navigationPath[0];
    this.navigationArrow = { lat: startPosition.lat, lng: startPosition.lng };
    this.runCinematicZoom(this.navigationArrow, 18, 65);

    this.startNavigationSimulation();
  }

  private startNavigationSimulation(): void {
    this.stopNavigationSimulation();

    if (this.navigationPath.length < 2) {
      this.onNavigationArrived();
      return;
    }

    const runTick = (): void => {
      if (!this.navigationStarted) {
        this.clearNavigationAnimationTimer();
        return;
      }

      if (this.navigationPathIndex >= this.navigationPath.length) {
        this.clearNavigationAnimationTimer();
        this.onNavigationArrived();
        return;
      }

      const current = this.navigationPath[this.navigationPathIndex];
      const isLastPoint = this.navigationPathIndex >= this.navigationPath.length - 1;
      const next = isLastPoint ? current : this.navigationPath[this.navigationPathIndex + 1];

      const currentPoint = { lat: current.lat, lng: current.lng };
      const heading = this.calculateHeading(currentPoint, { lat: next.lat, lng: next.lng });

      this.navigationArrow = currentPoint;
      this.mapOptions = {
        ...this.mapOptions,
        heading,
      };

      const ratio = this.navigationPathIndex / Math.max(1, this.navigationPath.length - 1);
      this.navigationProgress = Math.min(100, Math.round(ratio * 100));
      this.remainingDistanceKm = Number((this.totalDistanceKm * (1 - ratio)).toFixed(2));
      this.remainingDurationMinutes = Math.max(
        0,
        Math.round(this.totalDurationMinutes * (1 - ratio)),
      );
      this.navigationEta = new Date(Date.now() + this.remainingDurationMinutes * 60000);
      this.antOffset = (this.antOffset + 4) % 100;
      this.updateAntPathStyle();

      if (isLastPoint) {
        this.navigationProgress = 100;
        this.remainingDistanceKm = 0;
        this.remainingDurationMinutes = 0;
        this.navigationEta = new Date();
        this.clearNavigationAnimationTimer();
        this.onNavigationArrived();
        return;
      }

      this.navigationPathIndex++;
    };

    runTick();
    this.navigationAnimationTimer = window.setInterval(runTick, 420);
  }

  private onNavigationArrived(): void {
    if (this.hasHandledNavigationArrival) {
      return;
    }

    this.hasHandledNavigationArrival = true;
    this.navigationPanelVisible = true;
    this.routeRatingValue = 0;
  }

  private stopNavigationSimulation(): void {
    this.clearNavigationAnimationTimer();
    this.navigationPath = [];
    this.navigationPathIndex = 0;
    this.navigationArrow = undefined;
  }

  private clearNavigationAnimationTimer(): void {
    if (this.navigationAnimationTimer != null) {
      window.clearInterval(this.navigationAnimationTimer);
      this.navigationAnimationTimer = null;
    }
  }

  private resetMapToClassicView(): void {
    this.stopCameraAnimation();
    this.mapZoom = 15;
    this.mapOptions = {
      ...this.mapOptions,
      tilt: 0,
      heading: 0,
    };
  }

  private calculateHeading(from: google.maps.LatLngLiteral, to: google.maps.LatLngLiteral): number {
    const lat1 = (from.lat * Math.PI) / 180;
    const lat2 = (to.lat * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;

    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }

  private runCinematicZoom(
    targetCenter: google.maps.LatLngLiteral,
    targetZoom: number,
    targetTilt: number,
  ): void {
    this.stopCameraAnimation();

    const startCenter = this.center;
    const startZoom = this.mapZoom;
    const startTilt = this.mapOptions.tilt ?? 0;
    const totalFrames = 32;
    let frame = 0;

    this.cameraAnimationTimer = window.setInterval(() => {
      frame++;
      const t = frame / totalFrames;
      const eased = 1 - Math.pow(1 - t, 3);

      this.center = {
        lat: startCenter.lat + (targetCenter.lat - startCenter.lat) * eased,
        lng: startCenter.lng + (targetCenter.lng - startCenter.lng) * eased,
      };
      this.mapZoom = startZoom + (targetZoom - startZoom) * eased;
      this.mapOptions = {
        ...this.mapOptions,
        tilt: startTilt + (targetTilt - startTilt) * eased,
      };

      const map = this.mapRef?.googleMap;
      if (map) {
        map.panTo(this.center);
        map.setZoom(this.mapZoom);
        map.setTilt(this.mapOptions.tilt ?? 0);
      }

      if (t >= 1) {
        this.stopCameraAnimation();
      }
    }, 20);
  }

  private stopCameraAnimation(): void {
    if (this.cameraAnimationTimer != null) {
      window.clearInterval(this.cameraAnimationTimer);
      this.cameraAnimationTimer = null;
    }
  }

  private updateAntPathStyle(): void {
    this.activeRouteDashOptions = {
      ...this.activeRouteDashOptions,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            strokeColor: '#ffffff',
            scale: 4,
          },
          offset: `${this.antOffset}%`,
          repeat: '26px',
        },
      ],
    };
  }

  private buildNavigationPath(route: google.maps.DirectionsRoute): google.maps.LatLngLiteral[] {
    const overviewPath = route.overview_path ?? [];
    const overviewPoints = overviewPath
      .map((point) => this.toLatLngLiteral(point))
      .filter((point): point is google.maps.LatLngLiteral => point != null);

    if (overviewPoints.length >= 2) {
      return overviewPoints;
    }

    const points: google.maps.LatLngLiteral[] = [];
    const seen = new Set<string>();
    const pushPoint = (point: unknown): void => {
      const parsed = this.toLatLngLiteral(point);
      if (!parsed) {
        return;
      }

      const key = `${parsed.lat.toFixed(6)}|${parsed.lng.toFixed(6)}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      points.push(parsed);
    };

    for (const leg of route.legs ?? []) {
      pushPoint(leg.start_location);

      for (const step of leg.steps ?? []) {
        if (step.path?.length) {
          step.path.forEach((stepPoint) => pushPoint(stepPoint));
        } else {
          pushPoint(step.start_location);
          pushPoint(step.end_location);
        }
      }

      pushPoint(leg.end_location);
    }

    return points;
  }

  private normalizeNavigationPath(path: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral[] {
    if (!path.length) {
      return [];
    }

    const deduped: google.maps.LatLngLiteral[] = [];
    const seen = new Set<string>();
    for (const point of path) {
      const key = `${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(point);
    }

    if (deduped.length < 2) {
      return deduped;
    }

    const maxAnimationPoints = 140;
    const minAnimationPoints = 80;
    let normalized = deduped;

    if (normalized.length > maxAnimationPoints) {
      normalized = this.sampleNavigationPath(normalized, maxAnimationPoints);
    }

    if (normalized.length < minAnimationPoints) {
      normalized = this.densifyNavigationPath(normalized, minAnimationPoints);
    }

    return normalized.length >= 2 ? normalized : deduped;
  }

  private sampleNavigationPath(
    path: google.maps.LatLngLiteral[],
    maxPoints: number,
  ): google.maps.LatLngLiteral[] {
    if (path.length <= maxPoints) {
      return path;
    }

    const step = (path.length - 1) / (maxPoints - 1);
    const sampled: google.maps.LatLngLiteral[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < maxPoints; i++) {
      const index = Math.round(i * step);
      const point = path[index];
      if (!point) {
        continue;
      }

      const key = `${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      sampled.push(point);
    }

    const finalPoint = path[path.length - 1];
    if (sampled.length === 0 || sampled[sampled.length - 1] !== finalPoint) {
      sampled.push(finalPoint);
    }

    return sampled.length >= 2 ? sampled : path;
  }

  private densifyNavigationPath(
    path: google.maps.LatLngLiteral[],
    targetPoints: number,
  ): google.maps.LatLngLiteral[] {
    if (path.length < 2 || path.length >= targetPoints) {
      return path;
    }

    const segmentLengths: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const segmentLength = this.getApproxDistanceMeters(path[i], path[i + 1]);
      segmentLengths.push(segmentLength);
      totalDistance += segmentLength;
    }

    if (totalDistance <= 0) {
      return path;
    }

    const densified: google.maps.LatLngLiteral[] = [path[0]];
    const maxIndex = targetPoints - 1;
    let segmentIndex = 0;
    let traversed = 0;

    for (let i = 1; i < maxIndex; i++) {
      const targetDistance = (totalDistance * i) / maxIndex;
      while (
        segmentIndex < segmentLengths.length - 1 &&
        traversed + segmentLengths[segmentIndex] < targetDistance
      ) {
        traversed += segmentLengths[segmentIndex];
        segmentIndex++;
      }

      const start = path[segmentIndex];
      const end = path[Math.min(segmentIndex + 1, path.length - 1)];
      const currentSegmentLength = Math.max(0.0001, segmentLengths[segmentIndex] ?? 0.0001);
      const distanceInsideSegment = targetDistance - traversed;
      const ratio = Math.min(1, Math.max(0, distanceInsideSegment / currentSegmentLength));

      densified.push({
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      });
    }

    densified.push(path[path.length - 1]);
    return densified;
  }

  private getApproxDistanceMeters(
    from: google.maps.LatLngLiteral,
    to: google.maps.LatLngLiteral,
  ): number {
    const toRad = (value: number): number => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);
    const lat1 = toRad(from.lat);
    const lat2 = toRad(to.lat);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }

  private buildRouteChoiceOptions(directions: google.maps.DirectionsResult): void {
    const routes = directions.routes ?? [];
    const settingsRoutesCount = Number(this.uiSettings.settings().alternativeRoutesCount ?? 3);
    const maxRoutes = Number.isInteger(settingsRoutesCount)
      ? Math.max(1, Math.min(3, settingsRoutesCount))
      : 3;
    const limitedRoutes = routes.slice(0, maxRoutes);

    this.routeChoiceOptions = limitedRoutes
      .map((route, index) => {
        const legs = route.legs ?? [];
        if (legs.length === 0) {
          return null;
        }

        const totalDistanceMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
        const totalDurationSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
        const summary = `${route.summary ?? ''}`.trim();

        return {
          routeIndex: index,
          title: this.translate.instant('HOME_ROUTE_OPTION_LABEL', { index: index + 1 }),
          summary:
            summary.length > 0
              ? summary
              : this.translate.instant('HOME_ROUTE_OPTION_SUMMARY_FALLBACK'),
          distanceKm: Number((totalDistanceMeters / 1000).toFixed(1)),
          durationMin: Math.max(1, Math.round(totalDurationSeconds / 60)),
          isRecommended: index === 0,
        } as RouteChoiceOption;
      })
      .filter((value: RouteChoiceOption | null): value is RouteChoiceOption => value != null);
  }

  private createDirectionsResultForSelectedRoute(
    routeIndex: number,
  ): google.maps.DirectionsResult | undefined {
    if (!this.latestDirections?.routes?.length) {
      return undefined;
    }

    const selectedRoute = this.latestDirections.routes[routeIndex];
    if (!selectedRoute) {
      return undefined;
    }

    return {
      ...this.latestDirections,
      routes: [selectedRoute],
    };
  }

  private resolveActiveTripId(response: any): number | null {
    const candidates = [response?.data?.id, response?.data?.Id, response?.id, response?.Id];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private async loadRouteFeatureMarkers(
    route: google.maps.DirectionsRoute,
    routeFilters: JourneyRouteFilters,
    requestToken: number,
  ): Promise<void> {
    const roadFeatureMarkers = this.buildRoadFeatureMarkers(route, routeFilters);
    if (requestToken !== this.routeFeatureRequestToken) {
      return;
    }

    this.routeFeatureMarkers.set(roadFeatureMarkers);

    if (!routeFilters.includeEvChargingStations) {
      return;
    }

    const evMarkers = await this.findEvChargingMarkers(route, requestToken);
    if (requestToken !== this.routeFeatureRequestToken) {
      return;
    }

    this.routeFeatureMarkers.set([...roadFeatureMarkers, ...evMarkers]);
  }

  private async loadPoiPlacesForRoute(
    route: google.maps.DirectionsRoute,
    requestToken: number,
  ): Promise<void> {
    if (!this.selectedPoiIntents.length) {
      this.poiPlaces.set([]);
      this.poiMarkers.set([]);
      return;
    }

    const poiPlaces = await this.findPoiPlacesForRoute(route, requestToken, this.selectedPoiIntents);
    if (requestToken !== this.routeFeatureRequestToken) {
      return;
    }

    this.poiPlaces.set(poiPlaces);
    this.poiMarkers.set(
      poiPlaces.map((poi) => ({
        id: `poi-marker-${poi.id}`,
        position: poi.position,
        title: poi.name,
        options: {
          icon: this.poiMarkerIcon,
          zIndex: 986,
        },
      })),
    );
  }

  private async findPoiPlacesForRoute(
    route: google.maps.DirectionsRoute,
    requestToken: number,
    intents: PoiIntent[],
  ): Promise<PoiPlaceCard[]> {
    if (
      typeof google === 'undefined' ||
      !google.maps?.places?.PlacesService ||
      !google.maps?.places?.PlacesServiceStatus
    ) {
      return [];
    }

    const sampledPoints = this.sampleRoutePoints(route.overview_path ?? [], 7);
    if (sampledPoints.length === 0) {
      return [];
    }

    const queries = intents.flatMap((intent) =>
      intent.searchTerms
        .map((term) => `${term ?? ''}`.trim())
        .filter((term) => term.length > 0)
        .map((term) => ({
          category: intent.category,
          keyword: term,
        })),
    );
    if (!queries.length) {
      return [];
    }

    const placesService = new google.maps.places.PlacesService(
      this.mapRef?.googleMap ?? document.createElement('div'),
    );
    const searchResults = await Promise.all(
      sampledPoints.flatMap((point) =>
        queries.map((query) =>
          this.searchNearbyPoiByKeyword(placesService, point, query.keyword).then((results) => ({
            category: query.category,
            anchor: point,
            results,
          })),
        ),
      ),
    );

    if (requestToken !== this.routeFeatureRequestToken) {
      return [];
    }

    const uniquePlaces = new Map<string, PoiPlaceCard>();

    searchResults.forEach((entry, bucketIndex) => {
      entry.results.forEach((place, placeIndex) => {
        const location = place.geometry?.location;
        if (!location) {
          return;
        }

        const lat = location.lat();
        const lng = location.lng();
        const placeId = `${place.place_id ?? ''}`.trim();
        const fallbackKey = `${lat.toFixed(5)}|${lng.toFixed(5)}|${bucketIndex}|${placeIndex}`;
        const uniqueKey = placeId || fallbackKey;
        if (uniquePlaces.has(uniqueKey)) {
          return;
        }

        const name = `${place.name ?? ''}`.trim();
        if (!name) {
          return;
        }

        const card: PoiPlaceCard = {
          id: uniqueKey,
          placeId,
          name,
          address: `${place.vicinity ?? place.formatted_address ?? ''}`.trim(),
          rating: Number.isFinite(place.rating as number) ? Number(place.rating) : null,
          userRatingsTotal: Number(place.user_ratings_total ?? 0),
          photoUrl: this.extractPlacePhotoUrl(place),
          category: `${entry.category ?? ''}`.trim().toLowerCase(),
          position: { lat, lng },
          distanceFromRouteMeters: this.getApproxDistanceMeters(entry.anchor, { lat, lng }),
        };

        uniquePlaces.set(uniqueKey, card);
      });
    });

    return Array.from(uniquePlaces.values())
      .sort((a, b) => {
        const aRating = a.rating ?? 0;
        const bRating = b.rating ?? 0;
        if (aRating !== bRating) {
          return bRating - aRating;
        }

        if (a.userRatingsTotal !== b.userRatingsTotal) {
          return b.userRatingsTotal - a.userRatingsTotal;
        }

        return a.distanceFromRouteMeters - b.distanceFromRouteMeters;
      })
      .slice(0, 10);
  }

  private searchNearbyPoiByKeyword(
    placesService: google.maps.places.PlacesService,
    point: google.maps.LatLngLiteral,
    keyword: string,
  ): Promise<google.maps.places.PlaceResult[]> {
    const request: google.maps.places.PlaceSearchRequest = {
      location: point,
      radius: 1800,
      keyword,
    };

    return new Promise((resolve) => {
      placesService.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve(results ?? []);
          return;
        }

        resolve([]);
      });
    });
  }

  private extractPlacePhotoUrl(place: google.maps.places.PlaceResult): string | null {
    const photo = place.photos?.[0];
    if (!photo) {
      return null;
    }

    try {
      return photo.getUrl({ maxWidth: 320, maxHeight: 220 });
    } catch {
      return null;
    }
  }

  private buildRoadFeatureMarkers(
    route: google.maps.DirectionsRoute,
    routeFilters: JourneyRouteFilters,
  ): RouteFeatureMarker[] {
    const markers: RouteFeatureMarker[] = [];

    const tollPosition = this.findRouteFeaturePosition(route, 'toll');
    if (tollPosition) {
      markers.push(this.createRouteFeatureMarker('toll', tollPosition));
    }

    if (routeFilters.avoidHighways) {
      const highwayPosition = this.findRouteFeaturePosition(route, 'highway');
      if (highwayPosition) {
        markers.push(this.createRouteFeatureMarker('highway', highwayPosition));
      }
    }

    if (routeFilters.avoidFerries) {
      const ferryPosition = this.findRouteFeaturePosition(route, 'ferry');
      if (ferryPosition) {
        markers.push(this.createRouteFeatureMarker('ferry', ferryPosition));
      }
    }

    return markers;
  }

  private createRouteFeatureMarker(
    type: RouteFeatureMarkerType,
    position: google.maps.LatLngLiteral,
    customId?: string,
    customTitle?: string,
  ): RouteFeatureMarker {
    const title =
      customTitle ??
      this.translate.instant(
        type === 'toll'
          ? 'HOME_MAP_MARKER_TOLL'
          : type === 'highway'
            ? 'HOME_MAP_MARKER_HIGHWAY'
            : type === 'ferry'
              ? 'HOME_MAP_MARKER_FERRY'
              : 'HOME_MAP_MARKER_EV',
      );

    return {
      id: customId ?? `${type}-${position.lat.toFixed(5)}-${position.lng.toFixed(5)}`,
      position,
      title,
      options: {
        icon: this.routeFeatureIconByType[type],
        zIndex: 985,
      },
    };
  }

  private findRouteFeaturePosition(
    route: google.maps.DirectionsRoute,
    featureType: Exclude<RouteFeatureMarkerType, 'ev'>,
  ): google.maps.LatLngLiteral | null {
    const keywords = this.getRouteFeatureKeywords(featureType);
    const legs = route.legs ?? [];

    for (const leg of legs) {
      for (const step of leg.steps ?? []) {
        const normalizedInstruction = this.normalizeSearchText(step.instructions ?? '');
        if (!this.containsAnyKeyword(normalizedInstruction, keywords)) {
          continue;
        }

        return this.toLatLngLiteral(step.start_location ?? leg.start_location);
      }
    }

    const warningsText = this.normalizeSearchText((route.warnings ?? []).join(' '));
    if (this.containsAnyKeyword(warningsText, keywords) && legs.length > 0) {
      return this.toLatLngLiteral(legs[0].start_location);
    }

    return null;
  }

  private getRouteFeatureKeywords(featureType: Exclude<RouteFeatureMarkerType, 'ev'>): string[] {
    if (featureType === 'toll') {
      return ['toll', 'tolls', 'διοδι', 'διoδι'];
    }

    if (featureType === 'highway') {
      return ['highway', 'motorway', 'expressway', 'autobahn', 'freeway', 'αυτοκινητοδρομ'];
    }

    return ['ferry', 'boat', 'ship', 'πορθμ', 'πλοι'];
  }

  private normalizeSearchText(text: string): string {
    return `${text}`
      .replace(/<[^>]*>/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private containsAnyKeyword(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }

  private toLatLngLiteral(value: unknown): google.maps.LatLngLiteral | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const latSource = (value as { lat?: number | (() => number) }).lat;
    const lngSource = (value as { lng?: number | (() => number) }).lng;
    const lat = typeof latSource === 'function' ? Number(latSource()) : Number(latSource);
    const lng = typeof lngSource === 'function' ? Number(lngSource()) : Number(lngSource);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  }

  private async findEvChargingMarkers(
    route: google.maps.DirectionsRoute,
    requestToken: number,
  ): Promise<RouteFeatureMarker[]> {
    if (
      typeof google === 'undefined' ||
      !google.maps?.places?.PlacesService ||
      !google.maps?.places?.PlacesServiceStatus
    ) {
      return [];
    }

    const sampledPoints = this.sampleRoutePoints(route.overview_path ?? [], 6);
    if (sampledPoints.length === 0) {
      return [];
    }

    const placesService = new google.maps.places.PlacesService(
      this.mapRef?.googleMap ?? document.createElement('div'),
    );
    const searchResults = await Promise.all(
      sampledPoints.map((point) => this.searchNearbyEvStations(placesService, point)),
    );
    if (requestToken !== this.routeFeatureRequestToken) {
      return [];
    }

    const uniquePlaces = new Map<string, google.maps.places.PlaceResult>();
    searchResults.flat().forEach((place, index) => {
      const placeId = `${place.place_id ?? ''}`.trim();
      const geometryLocation = place.geometry?.location;
      const fallbackId = geometryLocation
        ? `${geometryLocation.lat().toFixed(5)}|${geometryLocation.lng().toFixed(5)}`
        : `ev-${index}`;
      const key = placeId || fallbackId;

      if (!uniquePlaces.has(key)) {
        uniquePlaces.set(key, place);
      }
    });

    const evTitle = this.translate.instant('HOME_MAP_MARKER_EV');
    const markers: RouteFeatureMarker[] = [];
    Array.from(uniquePlaces.entries())
      .slice(0, 8)
      .forEach(([key, place], index) => {
        const location = place.geometry?.location;
        if (!location) {
          return;
        }

        const placeName = `${place.name ?? ''}`.trim();
        const markerTitle = placeName.length > 0 ? `${evTitle}: ${placeName}` : evTitle;
        markers.push(
          this.createRouteFeatureMarker(
            'ev',
            { lat: location.lat(), lng: location.lng() },
            `ev-${key}-${index}`,
            markerTitle,
          ),
        );
      });

    return markers;
  }

  private searchNearbyEvStations(
    placesService: google.maps.places.PlacesService,
    point: google.maps.LatLngLiteral,
  ): Promise<google.maps.places.PlaceResult[]> {
    const request: google.maps.places.PlaceSearchRequest = {
      location: point,
      radius: 2400,
      keyword: 'EV charging station',
      type: 'electric_vehicle_charging_station',
    };

    return new Promise((resolve) => {
      placesService.nearbySearch(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve(results ?? []);
          return;
        }

        resolve([]);
      });
    });
  }

  private sampleRoutePoints(path: unknown[], maxSamples: number): google.maps.LatLngLiteral[] {
    if (!path || path.length === 0 || maxSamples <= 0) {
      return [];
    }

    const parsedPath = path
      .map((point) => this.toLatLngLiteral(point))
      .filter((point): point is google.maps.LatLngLiteral => point != null);
    if (parsedPath.length === 0) {
      return [];
    }

    if (parsedPath.length <= maxSamples) {
      return parsedPath;
    }

    const step = (parsedPath.length - 1) / (maxSamples - 1);
    const sampled: google.maps.LatLngLiteral[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < maxSamples; i++) {
      const index = Math.round(i * step);
      const point = parsedPath[index];
      if (!point) {
        continue;
      }

      const lat = point.lat;
      const lng = point.lng;
      const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      sampled.push({ lat, lng });
    }

    return sampled;
  }

  private loadFastPresetIcons(): void {
    this.fastPresetIconsLoading = true;

    this.dataService.getPresetIcons({}).subscribe({
      next: (response: any) => {
        const options = (response?.data ?? [])
          .map((item: any) => {
            const id = Number(item?.id ?? item?.Id);
            const iconData = `${item?.iconData ?? item?.IconData ?? item?.icon_data ?? ''}`.trim();
            const translationField =
              `${item?.translationField ?? item?.TranslationField ?? ''}`.trim();

            if (!Number.isInteger(id) || id <= 0) {
              return null;
            }

            return {
              id,
              iconData,
              translationField,
              safeIconSvg: iconData ? this.sanitizer.bypassSecurityTrustHtml(iconData) : null,
            } as PresetIconOption;
          })
          .filter((value: PresetIconOption | null): value is PresetIconOption => value != null);

        this.fastPresetIcons.set(options);
        this.fastPresetIconsLoading = false;
      },
      error: () => {
        this.fastPresetIcons.set([]);
        this.fastPresetIconsLoading = false;
      },
    });
  }

  private initializeFastPresetAutocompleteServices(): void {
    if (this.fastPresetAutocompleteService && this.fastPresetPlaceDetailsService) {
      return;
    }

    if (
      typeof google === 'undefined' ||
      !google.maps?.places?.AutocompleteService ||
      !google.maps?.places?.PlacesService
    ) {
      return;
    }

    this.fastPresetAutocompleteService = new google.maps.places.AutocompleteService();
    this.fastPresetPlaceDetailsService = new google.maps.places.PlacesService(
      document.createElement('div'),
    );
  }

  private getFastPresetAutocompleteSessionToken():
    | google.maps.places.AutocompleteSessionToken
    | undefined {
    if (
      !this.fastPresetAutocompleteSessionToken &&
      typeof google !== 'undefined' &&
      !!google.maps?.places?.AutocompleteSessionToken
    ) {
      this.fastPresetAutocompleteSessionToken = new google.maps.places.AutocompleteSessionToken();
    }

    return this.fastPresetAutocompleteSessionToken ?? undefined;
  }

  private buildFastPresetAutocompleteQuery(): string {
    const street = `${this.fastPresetForm.street ?? ''}`.trim();
    const number = `${this.fastPresetForm.number ?? ''}`.trim();
    const cityArea = `${this.fastPresetForm.cityArea ?? ''}`.trim();
    const postalCode = `${this.fastPresetForm.postalCode ?? ''}`.trim();

    return [street, number, cityArea, postalCode].filter((value) => value.length > 0).join(' ');
  }

  private parseAddressFromPlace(place: google.maps.places.PlaceResult): ParsedAddress {
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

  private clearFastPresetHideSuggestionsTimeout(): void {
    if (this.fastPresetHideSuggestionsTimeout != null) {
      window.clearTimeout(this.fastPresetHideSuggestionsTimeout);
      this.fastPresetHideSuggestionsTimeout = null;
    }
  }

  private saveFastPreset(): void {
    const userId = Number(this.currentUserId);
    const presetIconId = Number(this.fastPresetForm.presetIconId);

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      !Number.isInteger(presetIconId) ||
      presetIconId <= 0
    ) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('HOME_FAST_PRESETS_ERROR_TITLE'),
        detail: this.translate.instant('HOME_FAST_PRESETS_ERROR_MESSAGE'),
      });
      return;
    }

    const payload = {
      userID: userId,
      street: this.normalizeFastPresetField(this.fastPresetForm.street),
      number: this.normalizeFastPresetField(this.fastPresetForm.number),
      cityArea: this.normalizeFastPresetField(this.fastPresetForm.cityArea),
      postalCode: this.normalizeFastPresetField(this.fastPresetForm.postalCode),
      presetIconId,
    };

    this.fastPresetSaving = true;
    this.dataService.presetCreate(payload).subscribe({
      next: () => {
        this.fastPresetSaving = false;
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('HOME_FAST_PRESETS_SUCCESS_TITLE'),
          detail: this.translate.instant('HOME_FAST_PRESETS_SUCCESS_MESSAGE'),
        });
        void this.loadUserPresetMarkers();
        this.closeFastPresetsModal();
      },
      error: () => {
        this.fastPresetSaving = false;
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('HOME_FAST_PRESETS_ERROR_TITLE'),
          detail: this.translate.instant('HOME_FAST_PRESETS_ERROR_MESSAGE'),
        });
      },
    });
  }

  private hasAnyFastPresetAddressField(): boolean {
    return (
      this.normalizeFastPresetField(this.fastPresetForm.street) !== null ||
      this.normalizeFastPresetField(this.fastPresetForm.number) !== null ||
      this.normalizeFastPresetField(this.fastPresetForm.cityArea) !== null ||
      this.normalizeFastPresetField(this.fastPresetForm.postalCode) !== null
    );
  }

  private normalizeFastPresetField(value: string): string | null {
    const normalized = `${value ?? ''}`.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getVehicleSizeChipLabel(vehicleSize: VehicleSize | null): string | null {
    if (!vehicleSize) {
      return null;
    }

    const key = `FILTER_VEHICLE_SIZE_${vehicleSize.toUpperCase()}`;
    const translated = this.translate.instant(key);
    return translated && translated !== key ? translated : vehicleSize;
  }

  private formatAppliedFilterChipDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    const lang = `${this.translate.currentLang || this.translate.getDefaultLang() || 'el'}`.trim();
    return parsed.toLocaleString(lang);
  }

  private createInitialFastPresetForm(): FastPresetFormState {
    return {
      street: '',
      number: '',
      cityArea: '',
      postalCode: '',
      presetIconId: null,
    };
  }

  private persistHomeDraft(): void {
    this.isPersistingHomeDraftLocally = true;
    this.navService.setHomeDraft({
      searchText: this.currentSearchText,
      selectedChip: this.selectedChip,
      selectedChipPrompt: this.selectedChipPrompt,
      selectedMoodCode: this.selectedMoodCode,
      selectedMoodPrompt: this.selectedMoodPrompt,
    });
    this.isPersistingHomeDraftLocally = false;
  }

  private buildNavigationPrompt(): string {
    const preferencePrompt = `${this.selectedChipPrompt ?? ''}`.trim();
    const moodPrompt = `${this.selectedMoodPrompt ?? ''}`.trim();

    if (!moodPrompt) {
      return preferencePrompt;
    }

    if (
      preferencePrompt.length > 0 &&
      preferencePrompt.toLowerCase().includes(moodPrompt.toLowerCase())
    ) {
      return preferencePrompt;
    }

    if (!preferencePrompt) {
      return moodPrompt;
    }

    return `${preferencePrompt}. ${moodPrompt}`;
  }

  private loadVehicleLookup(): void {
    this.dataService.getVehicles({}).subscribe({
      next: (response: any) => {
        this.vehicleIdByCode.clear();

        const vehicles = response?.data ?? [];
        vehicles.forEach((vehicle: any) => {
          const code = `${vehicle?.code ?? vehicle?.Code ?? ''}`.trim().toLowerCase();
          const idRaw = vehicle?.id ?? vehicle?.Id;
          const id = Number(idRaw);

          if (code.length > 0 && Number.isInteger(id) && id > 0) {
            this.vehicleIdByCode.set(code, id);
          }
        });
      },
      error: () => {
        this.vehicleIdByCode.clear();
      },
    });
  }

  private loadPreferenceLookup(): void {
    this.dataService.getPreferences({}).subscribe({
      next: (response: any) => {
        this.preferencePromptByCode.clear();
        this.preferenceTranslationFieldByCode.clear();

        const preferences = (response?.data ?? [])
          .map((item: any) => ({
            code: this.normalizePreferenceCode(item?.code ?? item?.Code),
            prompt: `${item?.prompt ?? item?.Prompt ?? ''}`.trim(),
            translationField: `${item?.translationField ?? item?.TranslationField ?? ''}`.trim(),
          }))
          .filter((item: RoutePreferenceLookupItem) => item.code.length > 0);

        preferences.forEach((item: RoutePreferenceLookupItem) => {
          if (item.prompt.length > 0) {
            this.preferencePromptByCode.set(item.code, item.prompt);
          }

          if (item.translationField.length > 0) {
            this.preferenceTranslationFieldByCode.set(item.code, item.translationField);
          }
        });

        if (!this.selectedChipPrompt && this.selectedChip) {
          const mappedPrompt = this.getPreferencePromptByCode(this.selectedChip);
          if (mappedPrompt) {
            this.selectedChipPrompt = mappedPrompt;
            this.persistHomeDraft();
          }
        }
      },
      error: () => {
        this.preferencePromptByCode.clear();
        this.preferenceTranslationFieldByCode.clear();
      },
    });
  }

  private loadMoodLookup(): void {
    this.dataService.getMoods({}).subscribe({
      next: (response: any) => {
        this.moodTranslationFieldByCode.clear();

        const moods = (response?.data ?? [])
          .map((item: any) => ({
            code: `${item?.code ?? item?.Code ?? ''}`.trim().toLowerCase(),
            translationField: `${item?.translationField ?? item?.TranslationField ?? ''}`.trim(),
          }))
          .filter((item: { code: string }) => item.code.length > 0);

        moods.forEach((item: { code: string; translationField: string }) => {
          if (item.translationField.length > 0) {
            this.moodTranslationFieldByCode.set(item.code, item.translationField);
          }
        });
      },
      error: () => {
        this.moodTranslationFieldByCode.clear();
      },
    });
  }

  private async loadUserPresetMarkers(): Promise<void> {
    if (this.presetMarkersLoading) {
      return;
    }

    // Wait until map/google API is ready, otherwise geocoding returns empty.
    if (!this.isMapInitialized && (typeof google === 'undefined' || !google.maps?.Geocoder)) {
      return;
    }

    const userId = Number(this.currentUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.userPresetMarkers.set([]);
      return;
    }

    this.presetMarkersLoading = true;
    this.dataService.getPresetsByUser({ userId }).subscribe({
      next: async (response: any) => {
        try {
          const presets = (response?.data ?? []) as any[];
          const markers = await this.resolvePresetMarkers(presets);
          this.userPresetMarkers.set(markers);
        } finally {
          this.presetMarkersLoading = false;
        }
      },
      error: () => {
        this.userPresetMarkers.set([]);
        this.presetMarkersLoading = false;
      },
    });
  }

  private async resolvePresetMarkers(rawPresets: any[]): Promise<UserPresetMapMarker[]> {
    if (!Array.isArray(rawPresets) || rawPresets.length === 0) {
      return [];
    }

    const tasks = rawPresets.map(async (preset: any, index: number) => {
      const address = this.buildPresetAddress(preset);
      if (!address) {
        return null;
      }

      const position = await this.geocodePresetAddress(address);
      if (!position) {
        return null;
      }

      const iconData = `${preset?.iconData ?? preset?.IconData ?? ''}`.trim();
      const markerIcon = this.toPresetMarkerIcon(iconData);
      if (!markerIcon) {
        return null;
      }
      const translationField = `${preset?.translationField ?? preset?.TranslationField ?? ''}`.trim();
      const translated = translationField ? this.translate.instant(translationField) : '';
      const baseLabel =
        translated && translated !== translationField
          ? translated
          : `${preset?.street ?? ''}`.trim() || this.translate.instant('HOME_FAST_PRESETS_BUTTON');

      const marker: UserPresetMapMarker = {
        id: `preset-${preset?.id ?? preset?.Id ?? index}`,
        position,
        title: `${baseLabel}: ${address}`,
        options: {
          zIndex: 980,
          icon: markerIcon,
        },
      };
      return marker;
    });

    const resolved = await Promise.all(tasks);
    return resolved.filter((item: UserPresetMapMarker | null): item is UserPresetMapMarker => item != null);
  }

  private buildPresetAddress(preset: any): string {
    const street = `${preset?.street ?? preset?.Street ?? ''}`.trim();
    const number = `${preset?.number ?? preset?.Number ?? ''}`.trim();
    const cityArea = `${preset?.cityArea ?? preset?.CityArea ?? ''}`.trim();
    const postalCode = `${preset?.postalCode ?? preset?.PostalCode ?? ''}`.trim();
    const address = [street, number, cityArea, postalCode].filter((value) => value.length > 0).join(', ');
    return address.length > 0 ? `${address}, Greece` : '';
  }

  private geocodePresetAddress(address: string): Promise<google.maps.LatLngLiteral | null> {
    if (typeof google === 'undefined' || !google.maps?.Geocoder) {
      return Promise.resolve(null);
    }

    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ address, region: 'gr' }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
          const location = results[0].geometry?.location;
          if (location) {
            resolve({ lat: location.lat(), lng: location.lng() });
            return;
          }
        }

        const placesService = this.presetPlacesService;
        if (!placesService || !google.maps?.places?.PlacesServiceStatus) {
          resolve(null);
          return;
        }

        const request: google.maps.places.FindPlaceFromQueryRequest = {
          query: address,
          fields: ['name', 'geometry'],
          language: 'el',
        };

        placesService.findPlaceFromQuery(request, (placeResults, placeStatus) => {
          if (
            placeStatus !== google.maps.places.PlacesServiceStatus.OK ||
            !placeResults ||
            placeResults.length === 0
          ) {
            resolve(null);
            return;
          }

          const location = placeResults[0].geometry?.location;
          if (!location) {
            resolve(null);
            return;
          }

          resolve({ lat: location.lat(), lng: location.lng() });
        });
      });
    });
  }

  private toPresetMarkerIcon(iconData: string): google.maps.Icon | google.maps.Symbol | null {
    if (!iconData) {
      return null;
    }

    const pathMatch =
      iconData.match(/<path[^>]*\sd="([^"]+)"/i) ?? iconData.match(/<path[^>]*\sd='([^']+)'/i);
    const svgPath = `${pathMatch?.[1] ?? ''}`.trim();
    if (svgPath.length > 0) {
      return {
        path: svgPath,
        fillColor: '#0ea5e9',
        fillOpacity: 1,
        strokeColor: '#0369a1',
        strokeWeight: 1,
        scale: 1.35,
        anchor: new google.maps.Point(12, 12),
      };
    }

    const normalizedSvg = iconData
      .replace(/fill="currentColor"/g, 'fill="#0ea5e9"')
      .replace(/stroke="currentColor"/g, 'stroke="#0369a1"')
      .trim();

    if (!normalizedSvg) {
      return null;
    }

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(normalizedSvg)}`,
      scaledSize: new google.maps.Size(34, 34),
      anchor: new google.maps.Point(17, 17),
    };
  }

  private getMoodChipLabel(code: string): string {
    const normalized = `${code ?? ''}`.trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    const translationField = `${this.moodTranslationFieldByCode.get(normalized) ?? ''}`.trim();
    if (translationField.length > 0) {
      const translated = this.translate.instant(translationField);
      if (translated && translated !== translationField) {
        return translated;
      }
      return translationField;
    }

    return normalized;
  }

  private applyMapSettings(mapStyle: string, theme: string): void {
    const normalizedStyle = `${mapStyle ?? 'standard'}`.trim().toLowerCase();
    const normalizedTheme = `${theme ?? 'system'}`.trim().toLowerCase();

    const mapTypeId =
      normalizedStyle === 'satellite'
        ? google.maps.MapTypeId.SATELLITE
        : normalizedStyle === 'terrain'
          ? google.maps.MapTypeId.TERRAIN
          : google.maps.MapTypeId.ROADMAP;

    const darkMapStyles: google.maps.MapTypeStyle[] = [
      { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#1e293b' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c4a6e' }] },
      { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    ];

    const styles =
      normalizedStyle === 'standard' && normalizedTheme === 'dark' ? darkMapStyles : undefined;

    this.mapOptions = {
      ...this.mapOptions,
      mapTypeId,
      styles,
    };
  }

  private getSelectedPreferenceCode(): string {
    const fromDraft = this.normalizePreferenceCode(
      this.navService.getHomeDraftSnapshot().selectedChip,
    );
    if (fromDraft) {
      return fromDraft;
    }

    return this.normalizePreferenceCode(this.selectedChip);
  }

  private getPreferencePromptByCode(code: string): string {
    const normalized = this.normalizePreferenceCode(code);
    if (!normalized) {
      return '';
    }

    return `${this.preferencePromptByCode.get(normalized) ?? ''}`.trim();
  }

  private getPreferenceChipLabel(code: string): string {
    const normalized = this.normalizePreferenceCode(code);
    if (!normalized) {
      return '';
    }

    const translationField =
      `${this.preferenceTranslationFieldByCode.get(normalized) ?? ''}`.trim();
    if (translationField.length > 0) {
      const translated = this.translate.instant(translationField);
      if (translated && translated !== translationField) {
        return translated;
      }
      return translationField;
    }

    return normalized;
  }

  private normalizePreferenceCode(value: unknown): string {
    return `${value ?? ''}`.trim().toLowerCase();
  }
}
