import { Component, OnInit } from '@angular/core';
import { Home } from '../home/home';
import { ProgressSpinner } from "primeng/progressspinner";
import { Button } from "primeng/button";
import { Menu, MenuModule } from "primeng/menu";
import { TranslateService } from '@ngx-translate/core';
import {MenuItem, MessageService} from 'primeng/api';
import { IsLoaderFullCompEnabled } from '../../is-loader-full-comp-enabled';

@Component({
  selector: 'app-full',
  imports: [Home, ProgressSpinner, Button, Menu, MenuModule],
  templateUrl: './full.html',
  styleUrl: './full.css',
})
export class Full implements OnInit {
  languages: MenuItem[] | undefined;
  loading!: boolean;

  constructor(private translate: TranslateService, private isLoaderFullCompEnabled: IsLoaderFullCompEnabled){}

  ngOnInit() {
    this.loading = this.isLoaderFullCompEnabled.isLoading();
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
                        }
                    },
                    {
                        label: 'English (EN)',
                        icon: '',
                        command: () => {
                          this.changeLanguage('en');
                        }
                    }
                ]
            }
        ];
  }

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }

}
