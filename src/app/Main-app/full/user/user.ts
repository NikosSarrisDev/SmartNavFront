import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-user',
  imports: [],
  templateUrl: './user.html',
  styleUrl: './user.css',
})
export class User {

  user = signal({
    name: 'Nikolaos Papadopoulos',
    email: 'n.papadopoulos@example.com',
    role: 'STUDENT',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    trips: 12,
    distance: 150,
    ecoScore: 4.8
  });

  preferences = signal([
    { id: 'eco', label: 'Eco-friendly', active: true, icon: '🌱' },
    { id: 'scenic', label: 'Scenic', active: false, icon: '☀️' },
    { id: 'fast', label: 'Fastest', active: true, icon: '⚡' }
  ]);

  history = signal([
    { date: '23 Jun 2024', dest: 'Syntagma Square', dist: 5.2, score: 4.9 },
    { date: '21 Jun 2024', dest: 'Piraeus Port', dist: 12.0, score: 4.5 },
    { date: '15 Jun 2024', dest: 'Glyfada Center', dist: 15.5, score: 4.8 }
  ]);

  togglePreference(id: string) {
    this.preferences.update(prefs => 
      prefs.map(p => p.id === id ? { ...p, active: !p.active } : p)
    );
  }

}
