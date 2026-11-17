import { IsIn, IsNumber, IsOptional, IsPositive, IsUUID, Matches } from 'class-validator';
import type { Outcome } from '../config';

// Body of POST /payments. The decorators are the validation rules: the ValidationPipe
// registered in app.module.ts checks them before the controller method runs.
export class CreatePaymentDto {
  @IsUUID()
  orderId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a 3-letter code such as COP' })
  currency!: string;

  // Lets the caller choose the result, to try the "payment declined" path on demand.
  @IsOptional()
  @IsIn(['APPROVED', 'DECLINED'])
  simulateOutcome?: Outcome;
}
