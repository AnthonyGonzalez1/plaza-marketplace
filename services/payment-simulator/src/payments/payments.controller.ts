import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CreatePaymentDto } from './create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // 202 Accepted = "request received, the result comes later" (here, in a webhook). A plain
  // 201 Created would suggest that the payment is already done.
  @Post()
  @HttpCode(202)
  create(@Body() dto: CreatePaymentDto): { paymentId: string; status: 'PENDING' } {
    const payment = this.paymentsService.create(dto);
    return { paymentId: payment.paymentId, status: 'PENDING' };
  }
}
