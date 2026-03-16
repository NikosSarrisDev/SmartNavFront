import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../../data.service';
import { AuthenticationService } from '../../../auth.service';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-user',
  imports: [ProgressSpinnerModule],
  templateUrl: './user.html',
  styleUrl: './user.css',
})
export class User implements OnInit {
  currentUserId!: any
  currentRole!: string
  currentAvatar!: string
  currentEmail!: string
  currentUserName!: string
  trips: any[] = []
  totalTrips!: number
  totalDistance!: number
  loadingRoleAvatar!: boolean;
  loadingTrips!: boolean;


  constructor(private dataService: DataService, private auth: AuthenticationService){}

  ngOnInit(): void {
    if(this.auth.user && this.auth.user.data){
      this.loadingRoleAvatar = true;
      this.loadingTrips = true;
      this.currentUserId = this.auth.user.data.id
      this.currentEmail = this.auth.user.data.email
      this.currentUserName = this.auth.user.data.userName

      this.getCurrentUserRoleAndAvatar(this.currentUserId);
      this.getTrips(this.currentUserId);
    }
    this.loadingRoleAvatar = false;
    this.loadingTrips = false;
    
  }

  getCurrentUserRoleAndAvatar(userId: number) {
    this.dataService.getCurrentUserRoleAndAvatar({ userId })
      .pipe(finalize(() => this.loadingRoleAvatar = false))
      .subscribe({
        next: (response: any) => {
          this.currentRole = response.data.roleName;
          this.currentAvatar = response.data.avatarURL;
        },
        error: (err) => console.error("Avatar Load Failed", err)
      });
  }

  getTrips(userId: number) {
  this.dataService.getUserTripDetails({ userId })
    .pipe(finalize(() => this.loadingTrips = false))
    .subscribe({
      next: (response: any) => {
        this.trips = response.data;
        this.totalTrips = response.statistics.totalTrips;
        this.totalDistance = response.statistics.totalDistance;
      },
      error: (err) => console.error("Trips Load Failed", err)
    });
  }

  preferences = signal([
    { id: 'eco', label: 'Eco-friendly', active: true, icon: '🌱' },
    { id: 'scenic', label: 'Scenic', active: false, icon: '☀️' },
    { id: 'fast', label: 'Fastest', active: true, icon: '⚡' }
  ]);

  togglePreference(id: string) {
    this.preferences.update(prefs => 
      prefs.map(p => p.id === id ? { ...p, active: !p.active } : p)
    );
  }

}
