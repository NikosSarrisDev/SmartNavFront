import { computed, Component, OnInit } from '@angular/core';
import { Home } from '../home/home';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Button } from 'primeng/button';
import { Menu, MenuModule } from 'primeng/menu';
import { Dialog } from 'primeng/dialog';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';
import { NgIf } from '@angular/common';
import { FilterOptions } from '../filter-options/filter-options';

@Component({
  selector: 'app-full',
  imports: [Home, ProgressSpinner, Button, Menu, MenuModule, Dialog, FilterOptions, NgIf, TranslatePipe],
  templateUrl: './full.html',
  styleUrl: './full.css',
})
export class Full implements OnInit {
  languages: MenuItem[] | undefined;
  filtersModalVisible = false;

  constructor(
    private translate: TranslateService,
    private isLoaderFullCompEnabled: IsLoaderFullCompEnabled,
  ) {}

  ngOnInit() {
    this.translate.use('el');
    this.languages = [
      {
        label: 'Γλώσσα - Language',
        items: [
          {
            label: 'Ελληνικά (ΕΛ)',
            icon: '',
            command: () => {
              this.changeLanguage('el');
            },
          },
          {
            label: 'English (EN)',
            icon: '',
            command: () => {
              this.changeLanguage('en');
            },
          },
        ],
      },
    ];
  }

  //Computed Signal to capture the current state of loading spinner
  loading = computed(() => this.isLoaderFullCompEnabled.isLoading());

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }

  openFiltersModal(): void {
    this.filtersModalVisible = true;
  }

  closeFiltersModal(): void {
    this.filtersModalVisible = false;
  }
}
