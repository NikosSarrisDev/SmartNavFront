import { Component, OnInit, ViewChild } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe, NgIf } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { Observable, tap } from 'rxjs';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe, NgIf],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  loading!:boolean;
  selectedChip: string = '';
  public routeData$!: Observable<any>;

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  route?: google.maps.DirectionsResult;
  explanation: string = "";

  constructor(public navService: NavigationService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled) {}

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
          this.explanation = data.explanation;
        }
        this.isLoaderFullCompEnabled.setLoadingToFalse();
      })
    );
  }

}
