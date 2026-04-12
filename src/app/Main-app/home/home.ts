import { Component, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { JourneyRouteFilters, NavigationService } from '../../navigation.service';
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
import { MenuItem, MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { FormsModule } from '@angular/forms';
import { Chip } from 'primeng/chip';

type RouteFeatureMarkerType = 'toll' | 'highway' | 'ferry' | 'ev';
type RouteFeatureMarker = {
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
    Chip,
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
    icon: {
      path: 'M 0 -2 L 1.5 2 L 0 1 L -1.5 2 Z',
      fillColor: '#007bff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 1,
      scale: 6,
      rotation: 0,
    },
  };
  userStartMarkerOptions: google.maps.MarkerOptions = {
    zIndex: 998,
    clickable: false,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: '#1d4ed8',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 7,
    },
  };
  loadingAvatar = signal(false);
  public routeData$!: Observable<any>;
  private latestDirections?: google.maps.DirectionsResult;
  private navigationPath: google.maps.LatLng[] = [];
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
  route?: google.maps.DirectionsResult;
  explanation: string = '';
  chips: any[] = [];
  readonly routeFeatureMarkers = signal<RouteFeatureMarker[]>([]);
  private readonly vehicleIdByCode = new Map<string, number>();
  private readonly vehicleNameByCode = signal<Record<string, string>>({});
  private routeFeatureRequestToken = 0;
  private readonly routeFeatureIconByType: Record<RouteFeatureMarkerType, string> = {
    toll: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    highway: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
    ferry: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png',
    ev: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
  };
  readonly activeStationCount = computed(() => this.navService.journeyFilters().length);
  readonly activeRouteFilters = computed(() => this.navService.journeyRouteFilters());
  readonly activeVehicleName = computed(() => {
    const selectedVehicleCode = this.navService.vehicleSize();
    if (!selectedVehicleCode) {
      return null;
    }

    const namesByCode = this.vehicleNameByCode();
    return namesByCode[selectedVehicleCode] ?? selectedVehicleCode;
  });
  readonly hasActiveFilterChips = computed(() => {
    const routeFilters = this.activeRouteFilters();

    return (
      this.activeStationCount() > 0 ||
      !!this.activeVehicleName() ||
      routeFilters.avoidTolls ||
      routeFilters.avoidHighways ||
      routeFilters.avoidFerries ||
      routeFilters.trafficTimeMode !== 'none' ||
      !!routeFilters.trafficStartDateTime ||
      !!routeFilters.trafficEndDateTime ||
      routeFilters.includeEvChargingStations
    );
  });

  constructor(
    public navService: NavigationService,
    private isLoaderFullCompEnabled: IsLoaderFullCompEnabled,
    private auth: AuthenticationService,
    private dataService: DataService,
    private router: Router,
    private messageService: MessageService,
    private translate: TranslateService,
  ) {}

  async ngOnInit() {
    this.loadingAvatar.set(true);
    const currentUser = this.auth.currentUser();
    this.currentUserId = currentUser?.data?.id;
    this.currentUserName = currentUser?.data?.userName;
    const homeDraft = this.navService.getHomeDraftSnapshot();
    this.currentSearchText = homeDraft.searchText;
    this.selectedChip = homeDraft.selectedChip;
    this.selectedChipPrompt = homeDraft.selectedChipPrompt;

    try {
      this.center = await this.navService.getCurrentLocation();
    } catch {
      // Keep the current center fallback and rely on errorMessage$ for UI feedback.
    }
    this.getCurrentUserRoleAndAvatar(this.currentUserId);
    this.getPreferences();
    this.getActivePreference(this.currentUserId);
    this.loadVehicleLookup();
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

  selectChip(chip: { code: string; prompt: string }) {
    this.selectedChip = chip.code;
    this.selectedChipPrompt = chip.prompt;
    this.navigationStarted = false;
    this.navigationStartAt = null;
    this.navService.errorMessage$.next(null);
    this.persistHomeDraft();
  }

  onSearchTextChange(value: string): void {
    this.currentSearchText = value;
    this.persistHomeDraft();
  }

  getPreferences() {
    this.dataService.getPreferences({}).subscribe((res: any) => {
      this.chips = res.data;
    });
  }

  getActivePreference(userId: number) {
    this.dataService.getCurrentUserActivePreference({ userId }).subscribe(
      (response) => {
        const fallbackPreference = response?.data?.[0]?.code;
        this.currentUserPreference = fallbackPreference;

        this.dataService.getAiSuggestions({ userId }).subscribe({
          next: (aiResponse: any) => {
            const aiSuggested = aiResponse?.data?.suggestedPreference;
            if (aiSuggested) {
              this.currentUserPreference = aiSuggested;
            }
          },
          error: () => {
            this.currentUserPreference = fallbackPreference;
          },
        });
      },
      () => {
        this.currentUserPreference = null;
      },
    );
  }

  async findPath() {
    const trimmedQuery = (this.currentSearchText || '').trim();
    if (!trimmedQuery) {
      this.navService.errorMessage$.next('Please fill in the destination details first.');
      return;
    }

    if (!this.selectedChipPrompt) {
      this.navService.errorMessage$.next('Please choose one route preference chip first.');
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
    this.routeFeatureRequestToken++;
    this.routeFeatureMarkers.set([]);
    this.stopNavigationSimulation();
    this.resetMapToClassicView();

    const geminiPrompt = `${this.selectedChipPrompt}. User request: "${trimmedQuery}"`;

    this.routeData$ = this.navService.getSmartRoute(geminiPrompt, latestPosition).pipe(
      tap((data) => {
        if (data && data.explanation) {
          this.latestDirections = data.result;
          const route = data.result.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;

          route.legs.forEach((leg: any) => {
            totalDistance += leg.distance?.value ?? 0;
            totalDuration += leg.duration?.value ?? 0;
          });

          this.distance = (totalDistance / 1000).toFixed(1) + ' km';
          this.duration = Math.round(totalDuration / 60) + ' min';

          this.explanation = data.explanation;
          const routeFilters = this.navService.getJourneyRouteFiltersSnapshot();
          const currentToken = this.routeFeatureRequestToken;
          void this.loadRouteFeatureMarkers(route, routeFilters, currentToken);
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

    const selectedRoute = this.latestDirections.routes[0];
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
      score: 0,
      suggestedPreference: this.currentUserPreference,
      chosenPreference: this.selectedChip,
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
      next: () => {
        this.navigationStarted = true;
        this.navigationStartAt = new Date();
        this.navigationPanelVisible = true;
        this.totalDistanceKm = Number(totalDistanceKm.toFixed(2));
        this.totalDurationMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));
        this.remainingDistanceKm = this.totalDistanceKm;
        this.remainingDurationMinutes = this.totalDurationMinutes;
        this.navigationProgress = 0;
        this.navigationEta = new Date(Date.now() + this.totalDurationMinutes * 60000);
        this.activeRoutePath = (selectedRoute.overview_path ?? []).map((point) => ({
          lat: point.lat(),
          lng: point.lng(),
        }));
        this.antOffset = 0;
        this.updateAntPathStyle();
        this.destinationMarker = {
          lat: lastLeg.end_location.lat(),
          lng: lastLeg.end_location.lng(),
        };
        this.userStartMarker = {
          lat: firstLeg.start_location.lat(),
          lng: firstLeg.start_location.lng(),
        };
        this.enableNavigationView(selectedRoute);
        this.navService.errorMessage$.next(null);
      },
      error: () => {
        this.navService.errorMessage$.next('Navigation could not be started. Please try again.');
      },
    });
  }

  cancelNavigation() {
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
    this.stopNavigationSimulation();
    this.resetMapToClassicView();
  }

  canStartNavigation(): boolean {
    return !!this.latestDirections?.routes?.length;
  }

  getActiveStationChipLabel(): string {
    const stationCount = this.activeStationCount();
    if (stationCount <= 0) {
      return '';
    }

    const translationKey =
      stationCount === 1 ? 'HOME_ACTIVE_STATIONS_SINGLE' : 'HOME_ACTIVE_STATIONS_MULTI';
    return this.translate.instant(translationKey, { count: stationCount });
  }

  getTrafficStartChipLabel(routeFilters: JourneyRouteFilters): string {
    if (!routeFilters.trafficStartDateTime) {
      return '';
    }

    return this.translate.instant('HOME_FILTER_TRAFFIC_START_AT', {
      date: this.formatFilterDateTime(routeFilters.trafficStartDateTime),
    });
  }

  getTrafficEndChipLabel(routeFilters: JourneyRouteFilters): string {
    if (!routeFilters.trafficEndDateTime) {
      return '';
    }

    return this.translate.instant('HOME_FILTER_TRAFFIC_END_AT', {
      date: this.formatFilterDateTime(routeFilters.trafficEndDateTime),
    });
  }

  trackRouteFeatureMarker(_index: number, marker: RouteFeatureMarker): string {
    return marker.id;
  }

  ngOnDestroy(): void {
    this.persistHomeDraft();
    this.stopCameraAnimation();
    this.stopNavigationSimulation();
  }

  private enableNavigationView(route: google.maps.DirectionsRoute): void {
    this.navigationPath = route.overview_path ?? [];
    this.navigationPathIndex = 0;

    if (!this.navigationPath.length) {
      return;
    }

    const startPosition = this.navigationPath[0];
    this.navigationArrow = { lat: startPosition.lat(), lng: startPosition.lng() };
    this.runCinematicZoom(this.navigationArrow, 18, 65);

    this.startNavigationSimulation();
  }

  private startNavigationSimulation(): void {
    this.stopNavigationSimulation();

    if (this.navigationPath.length < 2) {
      return;
    }

    this.navigationAnimationTimer = window.setInterval(() => {
      if (!this.navigationStarted || this.navigationPathIndex >= this.navigationPath.length - 1) {
        this.stopNavigationSimulation();
        return;
      }

      const current = this.navigationPath[this.navigationPathIndex];
      const next = this.navigationPath[this.navigationPathIndex + 1];

      const currentPoint = { lat: current.lat(), lng: current.lng() };
      const heading = this.calculateHeading(currentPoint, { lat: next.lat(), lng: next.lng() });

      this.navigationArrow = currentPoint;
      this.center = currentPoint;
      this.mapOptions = {
        ...this.mapOptions,
        heading,
      };

      const icon = this.navigationArrowOptions.icon as google.maps.Symbol;
      this.navigationArrowOptions = {
        ...this.navigationArrowOptions,
        icon: {
          ...icon,
          rotation: heading,
        },
      };

      this.navigationPathIndex++;
      const ratio = this.navigationPathIndex / (this.navigationPath.length - 1);
      this.navigationProgress = Math.min(100, Math.round(ratio * 100));
      this.remainingDistanceKm = Number((this.totalDistanceKm * (1 - ratio)).toFixed(2));
      this.remainingDurationMinutes = Math.max(
        0,
        Math.round(this.totalDurationMinutes * (1 - ratio)),
      );
      this.navigationEta = new Date(Date.now() + this.remainingDurationMinutes * 60000);
      this.antOffset = (this.antOffset + 4) % 100;
      this.updateAntPathStyle();
    }, 900);
  }

  private stopNavigationSimulation(): void {
    if (this.navigationAnimationTimer != null) {
      window.clearInterval(this.navigationAnimationTimer);
      this.navigationAnimationTimer = null;
    }
    this.navigationPath = [];
    this.navigationPathIndex = 0;
    this.navigationArrow = undefined;
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

  private toLatLngLiteral(value?: google.maps.LatLng | null): google.maps.LatLngLiteral {
    if (!value) {
      return this.center;
    }

    return {
      lat: value.lat(),
      lng: value.lng(),
    };
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

  private sampleRoutePoints(
    path: google.maps.LatLng[],
    maxSamples: number,
  ): google.maps.LatLngLiteral[] {
    if (!path || path.length === 0 || maxSamples <= 0) {
      return [];
    }

    if (path.length <= maxSamples) {
      return path.map((point) => ({ lat: point.lat(), lng: point.lng() }));
    }

    const step = (path.length - 1) / (maxSamples - 1);
    const sampled: google.maps.LatLngLiteral[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < maxSamples; i++) {
      const index = Math.round(i * step);
      const point = path[index];
      if (!point) {
        continue;
      }

      const lat = point.lat();
      const lng = point.lng();
      const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      sampled.push({ lat, lng });
    }

    return sampled;
  }

  private formatFilterDateTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    const locale = this.translate.currentLang === 'el' ? 'el-GR' : 'en-US';
    return parsed.toLocaleString(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  private persistHomeDraft(): void {
    this.navService.setHomeDraft({
      searchText: this.currentSearchText,
      selectedChip: this.selectedChip,
      selectedChipPrompt: this.selectedChipPrompt,
    });
  }

  private loadVehicleLookup(): void {
    this.dataService.getVehicles({}).subscribe({
      next: (response: any) => {
        this.vehicleIdByCode.clear();
        const nextVehicleNameByCode: Record<string, string> = {};

        const vehicles = response?.data ?? [];
        vehicles.forEach((vehicle: any) => {
          const code = `${vehicle?.code ?? vehicle?.Code ?? ''}`.trim().toLowerCase();
          const idRaw = vehicle?.id ?? vehicle?.Id;
          const id = Number(idRaw);
          const translationField =
            `${vehicle?.translationField ?? vehicle?.TranslationField ?? ''}`.trim();
          const displayName = `${vehicle?.name ?? vehicle?.Name ?? ''}`.trim();
          const vehicleLabel = translationField || displayName || code;

          if (code.length > 0 && Number.isInteger(id) && id > 0) {
            this.vehicleIdByCode.set(code, id);
          }

          if (code.length > 0 && vehicleLabel.length > 0) {
            nextVehicleNameByCode[code] = vehicleLabel;
          }
        });

        this.vehicleNameByCode.set(nextVehicleNameByCode);
      },
      error: () => {
        this.vehicleIdByCode.clear();
        this.vehicleNameByCode.set({});
      },
    });
  }
}
