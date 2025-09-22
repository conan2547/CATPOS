package com.yourcompany.catcafepos.controller;

import com.yourcompany.catcafepos.dto.PaymentRequestDTO;
import com.yourcompany.catcafepos.dto.PaymentResponseDTO;
import com.yourcompany.catcafepos.service.PaymentService;
import org.springframework.web.bind.annotation.*;

/**
 * จัดการคำขอเกี่ยวกับการชำระเงินจากฝั่งไคลเอนต์
 */
@RestController
@RequestMapping("/api/payment")
public class PaymentController {
    private final PaymentService paymentService;

    /**
     * สร้างคอนโทรลเลอร์พร้อมบริการประมวลผลการชำระเงิน
     */
    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /**
     * รับคำร้องขอชำระเงินและส่งให้บริการประมวลผล
     */
    @PostMapping("/process")
    public PaymentResponseDTO processPayment(@RequestBody PaymentRequestDTO request) {
        return paymentService.processPayment(request);
    }
}
