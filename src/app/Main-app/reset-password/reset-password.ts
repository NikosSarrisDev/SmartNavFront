import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MenuItem, MessageService } from 'primeng/api';
import { DataService } from '../../data.service';
import { FloatLabel } from 'primeng/floatlabel';
import { Password } from 'primeng/password';
import { NgIf } from '@angular/common';
import { Toast } from 'primeng/toast';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { passwordStrengthValidator } from '../register/customValidatorPassWordStrength';
import { finalize, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ButtonModule,
    FloatLabel,
    FormsModule,
    NgIf,
    Password,
    ReactiveFormsModule,
    ProgressSpinnerModule,
    RouterLink,
    MenuModule,
    Toast,
    TranslatePipe,
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
  providers: [MessageService],
})
export class ResetPassword implements OnInit {
  resetForm!: FormGroup;
  resetToken = '';
  loading = false;
  submitted = false;
  languages: MenuItem[] | undefined;

  constructor(
    private formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private dataService: DataService,
    private messageService: MessageService,
    private translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.translate.use('el');
    this.languages = [
      {
        label: 'Language',
        items: [
          { label: 'Greek (EL)', command: () => this.changeLanguage('el') },
          { label: 'English (EN)', command: () => this.changeLanguage('en') },
        ],
      },
    ];

    this.resetToken = `${this.route.snapshot.queryParamMap.get('token') ?? ''}`.trim();

    this.resetForm = this.formBuilder.group(
      {
        newPassword: ['', [Validators.required, Validators.minLength(8), passwordStrengthValidator]],
        verifyPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  private passwordMatchValidator(form: FormGroup): void {
    const newPassword = form.get('newPassword')?.value;
    const verifyPassword = form.get('verifyPassword')?.value;
    if (newPassword !== verifyPassword) {
      form.get('verifyPassword')?.setErrors({ mismatch: true });
      return;
    }

    const errors = form.get('verifyPassword')?.errors;
    if (errors?.['mismatch']) {
      delete errors['mismatch'];
      if (Object.keys(errors).length === 0) {
        form.get('verifyPassword')?.setErrors(null);
      } else {
        form.get('verifyPassword')?.setErrors(errors);
      }
    }
  }

  private validateAllFormFields(formGroup: FormGroup | any): void {
    Object.keys(formGroup.controls).forEach((field) => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        control.markAsDirty({ onlySelf: true });
      } else if (control instanceof FormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }

  submit(): void {
    if (this.loading) {
      return;
    }

    if (!this.resetToken) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('RESET_PASSWORD_ERROR_TITLE'),
        detail: this.translate.instant('RESET_PASSWORD_INVALID_TOKEN'),
      });
      return;
    }

    if (this.resetForm.invalid) {
      this.validateAllFormFields(this.resetForm);
      this.submitted = true;
      return;
    }

    const newPassword = `${this.resetForm.get('newPassword')?.value ?? ''}`;
    this.loading = true;

    this.dataService
      .resetPassword({
        token: this.resetToken,
        newPassword,
      })
      .pipe(
        timeout(30000),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (response: any) => {
          if (response?.status !== 'success') {
            this.messageService.add({
              severity: 'error',
              summary: this.translate.instant('RESET_PASSWORD_ERROR_TITLE'),
              detail: response?.message || this.translate.instant('RESET_PASSWORD_ERROR_MESSAGE'),
            });
            return;
          }

          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('RESET_PASSWORD_SUCCESS_TITLE'),
            detail: this.translate.instant('RESET_PASSWORD_SUCCESS_MESSAGE'),
          });
          this.router.navigate(['/login']);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('RESET_PASSWORD_ERROR_TITLE'),
            detail: this.translate.instant('RESET_PASSWORD_ERROR_MESSAGE'),
          });
        },
      });
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang);
  }
}
