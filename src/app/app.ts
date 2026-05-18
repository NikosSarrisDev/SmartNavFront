import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GoogleMapsModule } from '@angular/google-maps';
import { UiSettingsService } from './ui-settings.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, GoogleMapsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('SmartNav');

  constructor(private readonly uiSettings: UiSettingsService) {}

  ngOnInit(): void {
    this.uiSettings.bootstrapFromCurrentUser();
  }
}
