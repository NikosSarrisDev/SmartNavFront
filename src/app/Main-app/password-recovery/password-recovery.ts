import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { DataService } from '../../data.service';
import { RouterLink } from '@angular/router';
import { FloatLabel } from 'primeng/floatlabel';
import { InputText } from 'primeng/inputtext';
import { NgIf } from '@angular/common';
import { Toast } from 'primeng/toast';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { finalize, timeout } from 'rxjs/operators';

type RecoveryAction = 'temporary' | 'reset-link';

@Component({
  selector: 'app-password-recovery',
  standalone: true,
  imports: [
    ButtonModule,
    FloatLabel,
    FormsModule,
    InputText,
    NgIf,
    ReactiveFormsModule,
    ProgressSpinnerModule,
    RouterLink,
    MenuModule,
    Toast,
    TranslatePipe,
  ],
  templateUrl: './password-recovery.html',
  styleUrl: './password-recovery.css',
  providers: [MessageService],
})
export class PasswordRecovery implements OnInit {
  recoveryForm!: FormGroup;
  languages: MenuItem[] | undefined;
  loading = false;
  currentAction: RecoveryAction | null = null;
  submitted = false;

  constructor(
    private formBuilder: FormBuilder,
    private messageService: MessageService,
    public dataService: DataService,
    private translate: TranslateService,
  ) {}

  ngOnInit() {
    this.translate.use('el');
    this.languages = [
      {
        label: 'Language',
        items: [
          {
            label: 'Greek (EL)',
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

    this.recoveryForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  validateAllFromFields(formGroup: FormGroup | any) {
    Object.keys(formGroup.controls).forEach((field) => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        control.markAsDirty({ onlySelf: true });
      } else if (control instanceof FormGroup) {
        this.validateAllFromFields(control);
      }
    });
  }

  submitTemporaryPassword(): void {
    this.submit('temporary');
  }

  submitResetLink(): void {
    this.submit('reset-link');
  }

  private submit(action: RecoveryAction): void {
    if (this.loading) {
      return;
    }

    if (this.recoveryForm.invalid) {
      this.validateAllFromFields(this.recoveryForm);
      this.submitted = true;
      this.messageService.add({
        severity: 'warn',
        summary: this.translate.instant('RECOVERY_WARNING_TITLE'),
        detail: this.translate.instant('RECOVERY_WARNING_DETAIL'),
      });
      return;
    }

    const email = `${this.recoveryForm.get('email')?.value ?? ''}`.trim();
    if (!email) {
      return;
    }

    this.loading = true;
    this.currentAction = action;

    const request$ =
      action === 'temporary'
        ? this.dataService.recoverPassword({ email })
        : this.dataService.recoverPasswordWithResetLink({ email });

    request$
      .pipe(
        timeout(30000),
        finalize(() => {
          this.loading = false;
          this.currentAction = null;
        }),
      )
      .subscribe({
        next: (response: any) => {
          if (response?.status === 'success') {
            this.messageService.add({
              severity: 'success',
              summary: this.translate.instant('RECOVERY_SUCCESS_TITLE'),
              detail: response.message,
            });
            return;
          }

          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('RECOVERY_ERROR_TITLE'),
            detail: response?.message || this.translate.instant('RECOVERY_ERROR_DETAIL'),
          });
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('RECOVERY_ERROR_TITLE'),
            detail: this.translate.instant('RECOVERY_ERROR_DETAIL'),
          });
        },
      });
  }

  changeLanguage(lang: string) {
    this.translate.use(lang);
  }
}
