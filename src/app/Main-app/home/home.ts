import { Component, OnInit, ViewChild } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe, NgIf, NgClass } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe, NgIf, TranslatePipe, NgClass],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  loading!:boolean;
  selectedChip: string = '';
  duration: string = '';
  distance: string = '';
  public routeData$!: Observable<any>;

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  route?: google.maps.DirectionsResult;
  explanation: string = "";

  constructor(public navService: NavigationService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled, private translate: TranslateService) {}

  async ngOnInit() {
    this.center = await this.navService.getCurrentLocation();
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
