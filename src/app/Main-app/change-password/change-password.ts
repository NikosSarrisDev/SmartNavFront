import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MenuItem, MessageService } from 'primeng/api';
import { DataService } from '../../data.service';
import { AuthenticationService } from '../../auth.service';
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
  selector: 'app-change-password',
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
  templateUrl: './change-password.html',
  styleUrl: './change-password.css',
  providers: [MessageService],
})
export class ChangePassword implements OnInit {
  changeForm!: FormGroup;
  loading = false;
  submitted = false;
  languages: MenuItem[] | undefined;

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private dataService: DataService,
    private auth: AuthenticationService,
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

    this.changeForm = this.formBuilder.group(
      {
        currentPassword: ['', [Validators.required]],
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

    if (this.changeForm.invalid) {
      this.validateAllFormFields(this.changeForm);
      this.submitted = true;
      return;
    }

    const currentSession = this.auth.currentUser();
    const userId = Number(currentSession?.data?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      this.messageService.add({
        severity: 'error',
        summary: this.translate.instant('CHANGE_PASSWORD_ERROR_TITLE'),
        detail: this.translate.instant('CHANGE_PASSWORD_SESSION_ERROR'),
      });
      return;
    }

    this.loading = true;
    this.dataService
      .changePassword({
        userId,
        currentPassword: `${this.changeForm.get('currentPassword')?.value ?? ''}`,
        newPassword: `${this.changeForm.get('newPassword')?.value ?? ''}`,
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
              summary: this.translate.instant('CHANGE_PASSWORD_ERROR_TITLE'),
              detail: response?.message || this.translate.instant('CHANGE_PASSWORD_ERROR_MESSAGE'),
            });
            return;
          }

          this.messageService.add({
            severity: 'success',
            summary: this.translate.instant('CHANGE_PASSWORD_SUCCESS_TITLE'),
            detail: this.translate.instant('CHANGE_PASSWORD_SUCCESS_MESSAGE'),
          });
          this.router.navigate(['/user']);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('CHANGE_PASSWORD_ERROR_TITLE'),
            detail: this.translate.instant('CHANGE_PASSWORD_ERROR_MESSAGE'),
          });
        },
      });
  }

  changeLanguage(lang: string): void {
    this.translate.use(lang);
  }
}
