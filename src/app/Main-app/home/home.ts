import { Component, OnInit, signal } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe, DatePipe, NgFor, NgIf, NgClass } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe, NgIf, NgFor, DatePipe, TranslatePipe, NgClass,ProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
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
  loadingAvatar = signal(false);
  public routeData$!: Observable<any>;
  private latestDirections?: google.maps.DirectionsResult;

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  route?: google.maps.DirectionsResult;
  explanation: string = "";
  chips: any[] = [];

  constructor(public navService: NavigationService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled, private auth: AuthenticationService, private dataService: DataService, private router: Router) {}

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
        this.navService.errorMessage$.next(null);
      },
      error: () => {
        this.navService.errorMessage$.next('Navigation could not be started. Please try again.');
      }
    });
  }

  canStartNavigation(): boolean {
    return !!this.latestDirections?.routes?.length;
  }
}
