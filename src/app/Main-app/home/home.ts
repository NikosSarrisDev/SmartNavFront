import { Component, OnInit, ViewChild } from '@angular/core';
import { NavigationService } from '../../navigation.service';
import { AsyncPipe } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';

@Component({
  selector: 'app-home',
  imports: [GoogleMapsModule, AsyncPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  selectedChip: string = '';

  center: google.maps.LatLngLiteral = { lat: 37.98, lng: 23.72 };
  route?: google.maps.DirectionsResult;
  explanation: string = "";

  constructor(public navService: NavigationService) {}

  async ngOnInit() {
    this.center = await this.navService.getCurrentLocation();
  }

  findPath(query: string) {
    if (!query) return;
    
    this.selectedChip = query;
    this.explanation = "";

    this.routeData$ = this.navService.getSmartRoute(query, this.center).subscribe(data => {
      this.route = data.result;
      this.explanation = data.explanation;
    });
  }

}
