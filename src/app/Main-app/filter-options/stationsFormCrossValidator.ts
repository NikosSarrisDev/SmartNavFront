import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function stationsFormCrossValidator(
  startControlName: string,
  endControlName: string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const startControl = group.get(startControlName);
    const endControl = group.get(endControlName);

    if (!startControl || !endControl) {
      return null;
    }

    const startValue = startControl.value;
    const endValue = endControl.value;

    if (startValue && endValue) {
      const startDate = new Date(startValue).getTime();
      const endDate = new Date(endValue).getTime();

      if (startDate >= endDate) {
        endControl.setErrors({ ...endControl.errors, dateRangeInvalid: true });
        return { dateRangeInvalid: true };
      } else {
        if (endControl.hasError('dateRangeInvalid')) {
          const errors = { ...endControl.errors };
          delete errors['dateRangeInvalid'];
          endControl.setErrors(Object.keys(errors).length ? errors : null);
        }
      }
    }

    return null;
  };
}
