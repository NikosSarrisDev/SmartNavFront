import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe, DatePipe, NgFor, NgIf, NgClass } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import {MenuItem, MessageService} from 'primeng/api';
import { Toast } from "primeng/toast";

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe, NgIf, NgFor, DatePipe, TranslatePipe, NgClass, ProgressSpinnerModule, Toast],
  templateUrl: './home.html',
  styleUrl: './home.css',
  providers: [MessageService]
})
export class Home implements OnInit, OnDestroy {
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
  destinationMarker?: google.maps.LatLngLiteral;
  navigationArrow?: google.maps.LatLngLiteral;
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
      rotation: 0
    }
  };
  loadingAvatar = signal(false);
  public routeData$!: Observable<any>;
  private latestDirections?: google.maps.DirectionsResult;
  private navigationPath: google.maps.LatLng[] = [];
  private navigationPathIndex = 0;
  private navigationAnimationTimer: number | null = null;

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  mapZoom = 15;
  mapOptions: google.maps.MapOptions = {
    tilt: 0,
    heading: 0,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  };
  route?: google.maps.DirectionsResult;
  explanation: string = "";
  chips: any[] = [];

  constructor(public navService: NavigationService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled, private auth: AuthenticationService, private dataService: DataService, private router: Router, private messageService: MessageService, private translate: TranslateService) {}

  async ngOnInit() {
    this.loadingAvatar.set(true);
    const currentUser = this.auth.currentUser();
    this.currentUserId = currentUser?.data?.id;
    this.currentUserName = currentUser?.data?.userName;
    this.center = await this.navService.getCurrentLocation();
    this.getCurrentUserRoleAndAvatar(this.currentUserId);
    this.getPreferences();
    this.getActivePreference(this.currentUserId);
  }

  getCurrentUserRoleAndAvatar(userId: number) {
      this.dataService.getCurrentUserRoleAndAvatar({ userId })
        .pipe(finalize(() => this.loadingAvatar.set(false)))
        .subscribe({
          next: (response: any) => {
            this.loadingAvatar.set(false);
            this.currentAvatar = response.data.avatarURL;
          },
          error: (err) => console.error("Avatar Load Failed", err)
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
  }

  getPreferences(){
    this.dataService.getPreferences({}).subscribe((res: any) => {
      this.chips = res.data;
    })
  }

  getActivePreference(userId: number){
    this.dataService.getCurrentUserActivePreference({ userId }).subscribe((response) => {
      this.currentUserPreference = response.data[0].code;
    })
  }

  findPath(query: string) {
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      this.navService.errorMessage$.next('Please fill in the destination details first.');
      return;
    }
    if (!this.isNavigationQuery(trimmedQuery)) {
      this.navService.errorMessage$.next('Only navigation-related requests are allowed.');
      return;
    }

    if (!this.selectedChipPrompt) {
      this.navService.errorMessage$.next('Please choose one route preference chip first.');
      return;
    }

    this.isLoaderFullCompEnabled.setLoadingToTrue();
    this.currentSearchText = trimmedQuery;
    this.explanation = "";
    this.navigationStarted = false;
    this.navigationStartAt = null;
    this.destinationMarker = undefined;
    this.stopNavigationSimulation();
    this.resetMapToClassicView();

    const geminiPrompt = `${this.selectedChipPrompt}. User request: "${trimmedQuery}"`;

    this.routeData$ = this.navService.getSmartRoute(geminiPrompt, this.center).pipe(tap(data => {
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
        }
      }),
      finalize(() => this.isLoaderFullCompEnabled.setLoadingToFalse())
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
    const totalDistanceKm = selectedRoute.legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0) / 1000;

    const payload = {
      userID: this.currentUserId,
      destination: lastLeg.end_address,
      departure: firstLeg.start_address,
      distanceKM: Number(totalDistanceKm.toFixed(2)),
      score: 0,
      suggestedPreference: this.currentUserPreference,
      chosenPreference: this.selectedChip,
      tripDate: new Date().toISOString()
    };

    this.dataService.tripCreate(payload).subscribe({
      next: () => {
        this.navigationStarted = true;
        this.navigationStartAt = new Date();
        this.destinationMarker = {
          lat: lastLeg.end_location.lat(),
          lng: lastLeg.end_location.lng()
        };
        this.enableNavigationView(selectedRoute);
        this.navService.errorMessage$.next(null);
      },
      error: () => {
        this.navService.errorMessage$.next('Navigation could not be started. Please try again.');
      }
    });
  }

  cancelNavigation(){
    this.navigationStarted = false;
    this.navigationStartAt = null;
    this.stopNavigationSimulation();
    this.resetMapToClassicView();
  }

  canStartNavigation(): boolean {
    return !!this.latestDirections?.routes?.length;
  }

  ngOnDestroy(): void {
    this.stopNavigationSimulation();
  }

  private isNavigationQuery(input: string): boolean {
  const query = input.toLowerCase().trim();

  const navigationKeywords = [
    'route', 'navigate', 'navigation', 'direction', 'directions', 'destination', 'trip', 'drive', 'driving',
    'avoid traffic', 'fastest', 'shortest', 'highway', 'street', 'road', 'avenue', 'boulevard', 'lane',
    'to ', 'from ', 'nearby', 'parking', 'fuel', 'gas station', 'bus', 'train station', 'airport',
    'ruta', 'navigatie', 'directie', 'catre', 'de la', 'strada', 'sosea',
    'διαδρομή', 'πλοήγηση', 'κατεύθυνση', 'κατευθύνσεις', 'προορισμός', 'ταξίδι', 'οδήγηση',
    'κίνηση', 'γρηγορότερη', 'συντομότερη', 'εθνική', 'οδός', 'δρόμος', 'λεωφόρος', 'στενό',
    'προς', 'από', 'κοντά', 'πάρκινγκ', 'βενζίνη', 'βενζινάδικο', 'λεωφορείο', 'σταθμός', 'αεροδρόμιο'
  ];

  const hasKeyword = navigationKeywords.some(keyword => query.includes(keyword));
  const hasCoordinates = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(query);
  const hasAddressPattern = /\b(st|street|rd|road|ave|avenue|blvd|boulevard|ln|lane|hwy|highway|nr|no|οδ|οδος|λεωφ|λεωφορος|πλατ|πλατεια|αγ)\b/.test(query);

  return hasKeyword || hasCoordinates || hasAddressPattern;
  }

  private enableNavigationView(route: google.maps.DirectionsRoute): void {
    this.mapZoom = 19;
    this.mapOptions = {
      ...this.mapOptions,
      tilt: 67.5,
      heading: 0
    };

    this.navigationPath = route.overview_path ?? [];
    this.navigationPathIndex = 0;

    if (!this.navigationPath.length) {
      return;
    }

    const startPosition = this.navigationPath[0];
    this.navigationArrow = { lat: startPosition.lat(), lng: startPosition.lng() };
    this.center = this.navigationArrow;

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
        heading
      };

      const icon = this.navigationArrowOptions.icon as google.maps.Symbol;
      this.navigationArrowOptions = {
        ...this.navigationArrowOptions,
        icon: {
          ...icon,
          rotation: heading
        }
      };

      this.navigationPathIndex++;
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
    this.mapZoom = 15;
    this.mapOptions = {
      ...this.mapOptions,
      tilt: 0,
      heading: 0
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
}

