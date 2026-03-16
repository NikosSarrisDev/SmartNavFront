import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe, NgIf, NgClass } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthenticationService } from '../../auth.service';
import { DataService } from '../../data.service';
import { finalize } from 'rxjs/operators';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe, NgIf, TranslatePipe, NgClass,ProgressSpinnerModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  currentUserId!: any;
  selectedChip: string = '';
  duration: string = '';
  distance: string = '';
  currentAvatar!: string;
  currentUserName!: string;
  loadingAvatar = signal(false);
  public routeData$!: Observable<any>;

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  route?: google.maps.DirectionsResult;
  explanation: string = "";

  constructor(public navService: NavigationService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled, private translate: TranslateService, private auth: AuthenticationService, private dataService: DataService, private router: Router) {}

  async ngOnInit() {
    this.loadingAvatar.set(true);
    this.currentUserId = this.auth.user.data.id;
    this.currentUserName = this.auth.user.data.userName;
    this.center = await this.navService.getCurrentLocation();
    this.getCurrentUserRoleAndAvatar(this.currentUserId);
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

  findPath(query: string) {
    this.isLoaderFullCompEnabled.setLoadingToTrue();
    if (!query) return;
    
    this.selectedChip = query;
    this.explanation = "";

    this.routeData$ = this.navService.getSmartRoute(query, this.center).pipe(tap(data => {
        if (data && data.explanation) {

          const route = data.result.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;

          route.legs.forEach((leg: any) => {
            totalDistance += leg.distance.value; // σε μέτρα
            totalDuration += leg.duration.value; // σε δευτερόλεπτα
          });
        
          this.distance = (totalDistance / 1000).toFixed(1) + ' km';
          this.duration = Math.round(totalDuration / 60) + ' min';

          this.explanation = data.explanation;
        }
        this.isLoaderFullCompEnabled.setLoadingToFalse();
      })
    );
  }

}
